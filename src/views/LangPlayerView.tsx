import { useStoreApi } from '../store/mediaSession';
import { ItemView, WorkspaceLeaf, TFile, TFolder, normalizePath, Notice, type ViewStateResult } from 'obsidian';
import React, { useCallback, useEffect, useRef } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { VIEW_TYPE_PLAYER, VIEW_TYPE_SUBTITLE_PANEL, SUBTITLE_EXTENSIONS } from '../types';
import type { MediaSource } from '../types';
import { MediaViewProvider } from '../context';
import type { LangPlayerPluginRef } from '../context';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { StudyWorkbench } from '../components/player/StudyWorkbench';
import { useSubtitleStore } from '../store/subtitleStore';
import { usePlaybackStore } from '../store/playbackStore';
import { useLoopStore } from '../store/loopStore';
import { resetMediaStores } from '../store';
import { dispatchLpEvent, useLpEventListener } from '../constants/events';
import { useRecordingStore } from '../store/recordingStore';
import { useDictationStore } from '../store/dictationStore';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useUIStore } from '../store/uiStore';
import { ensureVaultFolder, getSubtitleBaseNameCandidates, isSubtitleBaseNameVariant, isSubtitleFile, loadSubtitleCues } from '../utils';
import { Icon } from '../components/shared/Icon';
import { t } from '../i18n';
import { logger } from '../utils/logger';
import { MediaSessionContext, activateMediaSession, releaseMediaSession } from '../store/mediaSession';

interface PlayerAppProps {
  source: MediaSource | null;
  plugin: LangPlayerPluginRef;
  isCurrentSource: () => boolean;
}

function PlayerApp({ source, plugin, isCurrentSource }: PlayerAppProps) {
  const listenLpEvent = useLpEventListener();
  const useUIStoreApi = useStoreApi(useUIStore);
  const useRecordingStoreApi = useStoreApi(useRecordingStore);
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const useLoopStoreApi = useStoreApi(useLoopStore);
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const useDictationStoreApi = useStoreApi(useDictationStore);
  const recorder = useAudioRecorder();
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  const samplePath = '01-Input/Videos/示例听力练习.wav';
  const hasSample = !!plugin.app.vault.getAbstractFileByPath(samplePath);

  // Initialize overlay mode from settings on mount
  useEffect(() => {
    if (!plugin.settings.showInlineSubtitles) {
      useUIStoreApi.getState().setOverlayMode('off');
    }
  }, [plugin]);

  // Auto-load subtitles when source changes
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    void loadSubtitlesForSource(source, plugin, () => !cancelled && isCurrentSource(), cues => useSubtitleStoreApi.getState().setSubtitles(cues)).catch((error: unknown) => {
      logger.warn('Failed to auto-load subtitles:', error);
    });
    return () => { cancelled = true; };
  }, [source, plugin]);

  // Cleanup recorder on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current.isRecording()) {
        void recorderRef.current.stop().catch((error: unknown) => {
          logger.warn('Failed to stop recording during view cleanup:', error);
        });
      }
      useRecordingStoreApi.getState().reset();
    };
  }, []);

  // ─── Mic recording: simple capture → save to vault ──────────────────────

  /** Subtitle text captured when recording started; restored into the last-recording
   *  metadata so the listen-back UI can show the original sentence as a caption. */
  const captureSubtitleAtStartRef = useRef<string>('');

  const startRecording = useCallback(async () => {
    const playerRef = usePlaybackStoreApi.getState().playerRef;
    if (playerRef) playerRef.pauseVideo();
    // Stop any in-progress listen-back so the old recording doesn't play over
    // the mic while we capture a new take.
    dispatchLpEvent('langplayer-stop-recording-playback');
    // Recording must be exclusive with loop/AB modes.
    useLoopStoreApi.getState().exitMode();
    // Snapshot the active cue's text RIGHT NOW so we can show it next to
    // the listen-back button. Use textEn if present, fall back to raw text.
    const subState = useSubtitleStoreApi.getState();
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
    const dict = useDictationStoreApi.getState();
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
      useRecordingStoreApi.getState().setLastRecording({
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
      const state = useRecordingStoreApi.getState().recorderState;
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
    return listenLpEvent('langplayer-toggle-recording', () => { void handleMicClick(); });
  }, [handleMicClick]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!source) {
    return (
      <div className="lp-view-root lp-empty-state-wrap">
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

  return (
    <MediaViewProvider
      plugin={plugin}
      source={source}
      onMicClick={() => { void handleMicClick(); }}
    >
      <StudyWorkbench source={source} />
    </MediaViewProvider>
  );
}

async function ensureFolderRecursive(app: LangPlayerPluginRef['app'], folderPath: string): Promise<void> {
  await ensureVaultFolder(app, folderPath);
}

async function loadSubtitlesForSource(
  source: MediaSource,
  plugin: LangPlayerPluginRef,
  isCurrent: () => boolean,
  commit: (cues: import('../types').SubtitleCue[]) => void,
): Promise<void> {
  const file = source.file;
  const app = plugin.app;

  const tryLoadVaultFile = async (subtitleFile: TFile): Promise<boolean> => {
    try {
      const cues = await loadSubtitleCues(app, subtitleFile, plugin.settings.subtitleLineOrder);
      if (cues.length > 0 && isCurrent()) {
        commit(cues);
        await plugin.rememberSubtitleAssociation(source, subtitleFile);
        return true;
      }
    } catch {
      // Keep searching when a sibling subtitle is unreadable.
    }
    return false;
  };

  // An explicit choice has priority over folder-name heuristics. A missing or
  // invalid stored file is removed, then normal sibling discovery can recover.
  const rememberedPath = plugin.getSubtitleAssociationPath(source);
  const rememberedFile = plugin.getAssociatedSubtitleFile(source);
  if (rememberedFile && await tryLoadVaultFile(rememberedFile)) return;
  if (rememberedPath && isCurrent()) {
    await plugin.clearSubtitleAssociation(source);
    if (!isCurrent()) return;
  }

  // URL media can only use an explicit association. Local files additionally
  // support sibling discovery for a first-time open.
  if (!file) return;
  const parent = file.parent?.path ?? '';
  const baseNames = getSubtitleBaseNameCandidates(file.basename);

  // Prefer an exact media-name match before language-suffixed variants.
  for (const name of baseNames) {
    for (const ext of SUBTITLE_EXTENSIONS) {
      if (!isCurrent()) return;
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
      && isSubtitleBaseNameVariant(baseNames, candidate.basename),
  );
  for (const candidate of candidates) {
    if (!isCurrent()) return;
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
  readonly sessionId = crypto.randomUUID();
  private sourceGeneration = 0;
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
    return this.source?.displayName ?? t('app.name');
  }

  getIcon(): string {
    return 'play-circle';
  }

  getCurrentSource(): MediaSource | null {
    return this.root ? this.source : null;
  }

  isCurrentSource(source: MediaSource): boolean {
    return this.root !== null && this.source === source;
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
    this.registerEvent(this.app.workspace.on('active-leaf-change', leaf => {
      if (leaf === this.leaf) activateMediaSession(this.sessionId);
    }));
    this.registerDomEvent(this.containerEl, 'pointerdown', () => activateMediaSession(this.sessionId), true);
    this.registerDomEvent(this.containerEl, 'focusin', () => activateMediaSession(this.sessionId));
    activateMediaSession(this.sessionId);
    useUIStore.forSession(this.sessionId).getState().setTranscriptOpen(this.plugin.settings.subtitlePanelAutoOpen);
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
        const playerRef = usePlaybackStore.forSession(this.sessionId).getState().playerRef;
        if (playerRef) {
          playerRef.seekTo(source.timestamp);
          playerRef.playVideo();
        }
      }
      this.autoOpenSubtitlePanel();
      return;
    }

    // Different source: full reset
    this.sourceGeneration++;
    this.source = source;
    activateMediaSession(this.sessionId);
    resetMediaStores(this.sessionId);
    usePlaybackStore.forSession(this.sessionId).getState().setSource(source);

    this.render();

    this.autoOpenSubtitlePanel();
  }

  private autoOpenSubtitlePanel(): void {
    if (!this.plugin.settings.subtitlePanelAutoOpen) return;
    if (this.autoOpenTimer !== null) window.clearTimeout(this.autoOpenTimer);
    this.autoOpenTimer = window.setTimeout(() => {
      this.autoOpenTimer = null;
      void this.plugin.ensureSubtitlePanelVisible(this.leaf).catch((error: unknown) => {
        logger.warn('Failed to auto-open subtitle panel:', error);
      });
    }, 300);
  }

  private render(): void {
    if (!this.root) return;
    const generation = this.sourceGeneration;
    this.root.render(
      <ErrorBoundary>
        <MediaSessionContext.Provider value={this.sessionId}>
          <PlayerApp key={this.source?.url ?? 'empty'} source={this.source} plugin={this.plugin} isCurrentSource={() => generation === this.sourceGeneration} />
        </MediaSessionContext.Provider>
      </ErrorBoundary>,
    );
  }

  async onClose(): Promise<void> {
    this.sourceGeneration++;
    if (this.autoOpenTimer !== null) {
      window.clearTimeout(this.autoOpenTimer);
      this.autoOpenTimer = null;
    }
    this.root?.unmount();
    this.root = null;
    resetMediaStores(this.sessionId);
    releaseMediaSession(this.sessionId);
  }
}
