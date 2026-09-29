import { ItemView, WorkspaceLeaf, TFile, TFolder, normalizePath, Notice, type ViewStateResult } from 'obsidian';
import React, { useCallback, useEffect, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { VIEW_TYPE_PLAYER, VIEW_TYPE_SUBTITLE_PANEL, SUBTITLE_EXTENSIONS } from '../types';
import type { MediaSource } from '../types';
import { detectMediaType } from '../types';
import { MediaViewProvider } from '../context';
import type { LangPlayerPluginRef } from '../context';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { VideoLayout } from '../components/player/VideoLayout';
import { AudioLayout } from '../components/player/AudioLayout';
import { useSubtitleStore } from '../store/subtitleStore';
import { usePlaybackStore } from '../store/playbackStore';
import { useLoopStore } from '../store/loopStore';
import { resetMediaStores } from '../store';
import { dispatchLpEvent, onLpEvent } from '../constants/events';
import { useRecordingStore } from '../store/recordingStore';
import { useDictationStore } from '../store/dictationStore';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useUIStore } from '../store/uiStore';
import { ensureVaultFolder, isSubtitleFile, loadSubtitleCues } from '../utils';
import { Icon } from '../components/shared/Icon';
import { t } from '../i18n';
import { logger } from '../utils/logger';

interface PlayerAppProps {
  source: MediaSource | null;
  plugin: LangPlayerPluginRef;
}

function PlayerApp({ source, plugin }: PlayerAppProps) {
  const recorder = useAudioRecorder();
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const subtitleCount = useSubtitleStore((s) => s.subtitles.length);
  const samplePath = '01-Input/Videos/示例听力练习.wav';
  const hasSample = !!plugin.app.vault.getAbstractFileByPath(samplePath);

  // Initialize overlay mode from settings on mount
  useEffect(() => {
    if (!plugin.settings.showInlineSubtitles) {
      useUIStore.getState().setOverlayMode('off');
    }
  }, [plugin]);

  // Auto-load subtitles when source changes
  useEffect(() => {
    if (!source?.file) return;
    void loadSubtitlesForFile(source.file, plugin).catch((error: unknown) => {
      logger.warn('Failed to auto-load subtitles:', error);
    });
  }, [source, plugin]);

  // Cleanup recorder on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current.isRecording()) {
        void recorderRef.current.stop().catch((error: unknown) => {
          logger.warn('Failed to stop recording during view cleanup:', error);
        });
      }
      useRecordingStore.getState().reset();
    };
  }, []);

  // ─── Mic recording: simple capture → save to vault ──────────────────────

  /** Subtitle text captured when recording started; restored into the last-recording
   *  metadata so the listen-back UI can show the original sentence as a caption. */
  const captureSubtitleAtStartRef = useRef<string>('');

  const startRecording = useCallback(async () => {
    const playerRef = usePlaybackStore.getState().playerRef;
    if (playerRef) playerRef.pauseVideo();
    // Stop any in-progress listen-back so the old recording doesn't play over
    // the mic while we capture a new take.
    dispatchLpEvent('langplayer-stop-recording-playback');
    // Recording must be exclusive with loop/AB modes.
    useLoopStore.getState().exitMode();
    // Snapshot the active cue's text RIGHT NOW so we can show it next to
    // the listen-back button. Use textEn if present, fall back to raw text.
    const subState = useSubtitleStore.getState();
    const cue = subState.activeIndex >= 0 ? subState.subtitles[subState.activeIndex] : null;
    captureSubtitleAtStartRef.current = (cue?.textEn?.trim() || cue?.text?.trim() || '');
    const ok = await recorderRef.current.start();
    if (!ok) {
      new Notice(t('notice.micPermissionDenied'));
    }
  }, []);

  /** Measure the duration of an audio blob by loading it briefly into an
   *  <audio> element. Returns 0 if metadata can't be read in time. */
  const measureBlobDuration = (url: string): Promise<number> =>
    new Promise((resolve) => {
      const audio = new Audio();
      let settled = false;
      const done = (sec: number) => {
        if (settled) return;
        settled = true;
        // Release the element + its blob reference so it can be GC'd.
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.removeAttribute('src');
        audio.load();
        resolve(sec);
      };
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => done(isFinite(audio.duration) ? audio.duration : 0);
      audio.onerror = () => done(0);
      // Safety timeout so we never hang the recording stop flow
      window.setTimeout(() => done(0), 2000);
      audio.src = url;
    });

  const stopAndSave = useCallback(async () => {
    // Normalize a stale 'playing' phase to 'awaitInput' BEFORE the recorder flips
    // to idle. The recorder sets recorderState='idle' inside its onstop (before
    // this await resolves), which makes DictationPanel's replay effect fire; if
    // phase were still 'playing' that effect would re-play the original instead
    // of letting RecordingPlayback auto-play the user's take. Doing it here (while
    // still 'recording', so the effect is gated off) wins the race deterministically.
    const dict = useDictationStore.getState();
    if (dict.dictationOpen && dict.phase === 'playing') dict.setPhase('awaitInput');

    const blob = await recorderRef.current.stop();
    if (!blob || !source) return;

    // Build a timestamped filename. Extension must match the blob's ACTUAL
    // container (iOS records mp4/AAC, not webm) — naming an mp4 blob `.webm`
    // produces a file players refuse to open.
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}_${String(now.getMilliseconds()).padStart(3, '0')}`;
    const ext = audioExtFromMime(blob.type) ?? (plugin.settings.audioFormat || 'webm');
    const audioFileName = `rec_${ts}.${ext}`;
    const audioFolder = normalizePath((plugin.settings.audioFolder || 'LangPlayer/recordings').trim());
    const recFilePath = normalizePath(`${audioFolder}/${audioFileName}`);

    try {
      const arrayBuf = await blob.arrayBuffer();
      await ensureFolderRecursive(plugin.app, audioFolder);
      await plugin.app.vault.createBinary(recFilePath, arrayBuf);
      new Notice(`${t('notice.recordingSaved')}: ${recFilePath}`);

      // Expose for instant listen-back. Create blob URL + measure duration.
      // Store action revokes any previous URL automatically.
      const url = URL.createObjectURL(blob);
      const durationSec = await measureBlobDuration(url);
      useRecordingStore.getState().setLastRecording({
        url,
        durationSec,
        filePath: recFilePath,
        subtitleText: captureSubtitleAtStartRef.current,
      });
    } catch (e) {
      new Notice(`${t('notice.recordingSaveFailed')}: ${(e as Error).message}`);
      logger.error('[PlayerApp] Failed to save recording:', e);
    }
  }, [source, plugin]);

  const handleMicClick = useCallback(async () => {
    try {
      const state = useRecordingStore.getState().recorderState;
      if (state === 'recording') {
        await stopAndSave();
      } else if (state === 'idle') {
        await startRecording();
      }
    } catch (error) {
      logger.error('Failed to toggle recording:', error);
      new Notice(t('notice.recordingSaveFailed'));
    }
  }, [startRecording, stopAndSave]);

  // External hotkey: Obsidian command `player-toggle-recording` dispatches this
  // window event. Lets the user start/stop recording from the keyboard without
  // moving the mouse to the mic button. Always reflects the latest handler
  // (which depends on `source` so we close over it via the ref-less callback).
  useEffect(() => {
    return onLpEvent('langplayer-toggle-recording', () => { void handleMicClick(); });
  }, [handleMicClick]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!source) {
    return (
      <div className="lp-view-root lp-empty-state-wrap">
        <StudyFlowBar plugin={plugin} source={source} subtitleCount={subtitleCount} />
        <div className="lp-empty-state">
          <div className="lp-empty-state-icon"><Icon name="film" size={48} /></div>
          <h2 className="lp-empty-state-title">{t('empty.title')}</h2>
          <p className="lp-empty-state-description">{t('empty.description')}</p>
          <div className="lp-empty-state-actions">
            {hasSample && (
              <button className="lp-btn lp-btn-primary" onClick={() => { void plugin.openMediaAt(samplePath); }}>
                <Icon name="play-circle" size={15} /> {t('empty.openSample')}
              </button>
            )}
            <button className="lp-btn" onClick={plugin.openMediaPicker}>
              <Icon name="folder-open" size={15} /> {t('empty.openMedia')}
            </button>
          </div>
          <ol className="lp-empty-state-steps">
            <li>{t('empty.stepOne')}</li>
            <li>{t('empty.stepTwo')}</li>
            <li>{t('empty.stepThree')}</li>
          </ol>
        </div>
      </div>
    );
  }

  const mediaType = detectMediaType(source.url);

  return (
    <MediaViewProvider
      plugin={plugin}
      source={source}
      onMicClick={() => { void handleMicClick(); }}
    >
        <div className="lp-view-root">
          <StudyFlowBar plugin={plugin} source={source} subtitleCount={subtitleCount} />
          <div className="lp-view-media-shell">
            {mediaType === 'video' ? (
              <VideoLayout source={source} />
            ) : (
              <AudioLayout source={source} />
            )}
          </div>
        </div>
    </MediaViewProvider>
  );
}

function StudyFlowBar({ plugin, source, subtitleCount }: {
  plugin: LangPlayerPluginRef;
  source: MediaSource | null;
  subtitleCount: number;
}) {
  const hasSubtitles = subtitleCount > 0;
  return (
    <nav className="lp-study-flow" aria-label={t('flow.title')}>
      <span className="lp-study-flow-label">{t('flow.title')}</span>
      <button className="lp-study-flow-step lp-study-flow-step--active" onClick={plugin.openMediaPicker}>
        <span className="lp-study-flow-number">1</span>{t('flow.listen')}
      </button>
      <span className="lp-study-flow-arrow" aria-hidden="true">→</span>
      <button className="lp-study-flow-step" onClick={() => { void plugin.openDictationView(); }} disabled={!hasSubtitles}>
        <span className="lp-study-flow-number">2</span>{t('flow.dictation')}
      </button>
      <span className="lp-study-flow-arrow" aria-hidden="true">→</span>
      <button className="lp-study-flow-step" onClick={() => { void plugin.openVocabulary(); }}>
        <span className="lp-study-flow-number">3</span>{t('flow.vocabulary')}
      </button>
      <span className="lp-study-flow-arrow" aria-hidden="true">→</span>
      <button className="lp-study-flow-step" onClick={plugin.startReview}>
        <span className="lp-study-flow-number">4</span>{t('flow.review')}
      </button>
      <span className="lp-study-flow-arrow" aria-hidden="true">→</span>
      <button className="lp-study-flow-step" onClick={() => { void plugin.noteService.openStudyNote(source); }}>
        <span className="lp-study-flow-number">5</span>{t('flow.output')}
      </button>
    </nav>
  );
}

async function ensureFolderRecursive(app: LangPlayerPluginRef['app'], folderPath: string): Promise<void> {
  await ensureVaultFolder(app, folderPath);
}

async function loadSubtitlesForFile(file: TFile, plugin: LangPlayerPluginRef): Promise<void> {
  const app = plugin.app;
  const baseName = file.basename;
  const parent = file.parent?.path ?? '';

  // Also try without _aac suffix (from auto-transcode)
  const baseNames = [baseName];
  if (baseName.endsWith('_aac')) {
    baseNames.push(baseName.slice(0, -4));
  }

  const tryLoadVaultFile = async (subtitleFile: TFile): Promise<boolean> => {
    try {
      const cues = await loadSubtitleCues(app, subtitleFile, plugin.settings.subtitleLineOrder);
      if (cues.length > 0) {
        useSubtitleStore.getState().setSubtitles(cues);
        return true;
      }
    } catch {
      // Keep searching when a sibling subtitle is unreadable.
    }
    return false;
  };

  // Prefer an exact media-name match before language-suffixed variants.
  for (const name of baseNames) {
    for (const ext of SUBTITLE_EXTENSIONS) {
      const subPath = normalizePath(parent ? `${parent}/${name}.${ext}` : `${name}.${ext}`);
      const subFile = app.vault.getAbstractFileByPath(subPath);
      if (subFile instanceof TFile && await tryLoadVaultFile(subFile)) return;
    }
  }

  const parentFolder = parent ? app.vault.getAbstractFileByPath(parent) : app.vault.getRoot();
  if (!(parentFolder instanceof TFolder)) return;
  const candidates = parentFolder.children.filter(
    (candidate): candidate is TFile =>
      candidate instanceof TFile
      && isSubtitleFile(candidate.path)
      && baseNames.some((name) => candidate.basename.startsWith(`${name}.`)),
  );
  for (const candidate of candidates) {
    if (await tryLoadVaultFile(candidate)) return;
  }
}

/** File extension matching a recorded audio blob's actual container, or null
 *  when the mime type is unknown (caller falls back to the settings default). */
function audioExtFromMime(mime: string): string | null {
  if (!mime) return null;
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return null;
}

export class LangPlayerView extends ItemView {
  private root: Root | null = null;
  private source: MediaSource | null = null;
  private pendingSource: MediaSource | null = null; // Deferred source if setState runs before onOpen
  private autoOpenTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: LangPlayerPluginRef,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PLAYER;
  }

  getDisplayText(): string {
    return this.source?.displayName ?? 'LangPlayer';
  }

  getIcon(): string {
    return 'play-circle';
  }

  // ─── State persistence (handles registerExtensions + workspace restore) ───

  getState(): Record<string, unknown> {
    const state = super.getState();
    if (this.source?.file) {
      state['file'] = this.source.file.path;
    } else if (this.source?.type === 'url') {
      state['url'] = this.source.url;
      state['displayName'] = this.source.displayName;
    }
    return state;
  }

  async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
    await super.setState(state, result);

    // Defensive: state might be null/undefined during workspace restore
    if (!state || typeof state !== 'object') return;

    try {
      const source = this.parseSourceFromState(state);
      if (!source) return;

      if (this.root) {
        // Root is ready, apply source immediately
        this.setSource(source);
      } else {
        // Root not created yet (setState called before onOpen) — defer
        this.pendingSource = source;
      }
    } catch (e) {
      // Don't let state restoration crash the view
      logger.warn('Failed to restore view state:', e);
    }
  }

  /** Parse a MediaSource from Obsidian view state */
  private parseSourceFromState(state: Record<string, unknown>): MediaSource | null {
    const filePath = typeof state['file'] === 'string' ? state['file'] : undefined;
    const url = typeof state['url'] === 'string' ? state['url'] : undefined;

    if (filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (file instanceof TFile) {
        const resourceUrl = this.app.vault.getResourcePath(file);
        return {
          type: 'local',
          url: resourceUrl,
          displayName: file.basename,
          file,
        };
      }
    }

    if (url) {
      return {
        type: 'url',
        url,
        displayName: typeof state['displayName'] === 'string' ? state['displayName'] : url,
      };
    }

    return null;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();
    container.addClass('lp-view-content');

    this.root = createRoot(container);

    // Apply deferred source from setState (if it ran before onOpen)
    if (this.pendingSource) {
      const source = this.pendingSource;
      this.pendingSource = null;
      // Use setSource() so auto-open subtitle panel logic runs
      this.setSource(source);
      return; // setSource already calls render()
    }

    this.render();
  }

  setSource(source: MediaSource): void {
    const currentSource = this.source;

    // Same media file already loaded — just seek to timestamp, skip destructive reset.
    // reset() would clear playerRef/duration from the store, and since the <video src>
    // doesn't change, loadedmetadata won't re-fire to restore them.
    if (currentSource && currentSource.url === source.url) {
      this.source = source;
      if (source.timestamp != null) {
        const playerRef = usePlaybackStore.getState().playerRef;
        if (playerRef) {
          playerRef.seekTo(source.timestamp);
          playerRef.playVideo();
        }
      }
      this.autoOpenSubtitlePanel();
      return;
    }

    // Different source: full reset
    this.source = source;
    resetMediaStores();
    usePlaybackStore.getState().setSource(source);

    this.render();

    this.autoOpenSubtitlePanel();
  }

  private autoOpenSubtitlePanel(): void {
    if (!this.plugin.settings.subtitlePanelAutoOpen) return;
    if (this.autoOpenTimer !== null) window.clearTimeout(this.autoOpenTimer);
    this.autoOpenTimer = window.setTimeout(() => {
      this.autoOpenTimer = null;
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SUBTITLE_PANEL);
      if (existing.length === 0) {
        void this.plugin.openSubtitlePanel().catch((error: unknown) => {
          logger.warn('Failed to auto-open subtitle panel:', error);
        });
      }
    }, 300);
  }

  private render(): void {
    if (!this.root) return;
    this.root.render(
      <ErrorBoundary>
        <PlayerApp source={this.source} plugin={this.plugin} />
      </ErrorBoundary>,
    );
  }

  async onClose(): Promise<void> {
    if (this.autoOpenTimer !== null) {
      window.clearTimeout(this.autoOpenTimer);
      this.autoOpenTimer = null;
    }
    resetMediaStores();
    this.root?.unmount();
    this.root = null;
  }
}
