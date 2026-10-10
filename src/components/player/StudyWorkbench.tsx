import React, { useEffect, useRef, useState } from 'react';
import { Notice } from 'obsidian';
import { detectMediaType, VIEW_TYPE_DICTATION, type MediaSource, type PlayerRef } from '../../types';
import { useMediaView } from '../../context';
import { useUIStore, type StudyMode } from '../../store/uiStore';
import { useStoreApi } from '../../store/mediaSession';
import { usePlaybackStore } from '../../store/playbackStore';
import { selectCurrentSubtitle, useSubtitleStore } from '../../store/subtitleStore';
import { useRecordingStore } from '../../store/recordingStore';
import { useDictationStore } from '../../store/dictationStore';
import { usePlaybackMode } from '../../hooks/usePlaybackMode';
import { AudioLayout } from './AudioLayout';
import { VideoLayout } from './VideoLayout';
import { PlaybackBar } from '../subtitle/PlaybackBar';
import { SubtitlePanel } from '../subtitle/SubtitlePanel';
import { DictationPanel } from '../dictation/DictationPanel';
import { ClickableText } from '../subtitle/ClickableText';
import { RecordingPlayback } from '../recording/RecordingPlayback';
import { Icon } from '../shared/Icon';
import { t } from '../../i18n';
import { dispatchLpEvent } from '../../constants/events';
import { formatTime } from '../../utils';

const modes: { id: StudyMode; icon: string; label: 'studio.listen' | 'studio.dictation' | 'studio.shadow' }[] = [
  { id: 'listen', icon: 'headphones', label: 'studio.listen' },
  { id: 'dictation', icon: 'keyboard', label: 'studio.dictation' },
  { id: 'shadow', icon: 'mic', label: 'studio.shadow' },
];

/** Media stays mounted in the same position while the practice surface changes. */
export function StudyWorkbench({ source }: { source: MediaSource }) {
  const { plugin, onOpenNote } = useMediaView();
  const ui = useStoreApi(useUIStore);
  const mode = useUIStore(s => s.studyMode);
  const transcriptOpen = useUIStore(s => s.transcriptOpen);
  const subtitles = useSubtitleStore(s => s.subtitles);
  const recorderState = useRecordingStore(s => s.recorderState);
  const busy = recorderState !== 'idle';
  const player = usePlaybackStore(s => s.playerRef);
  const playerRef = useRef<PlayerRef | null>(player);
  playerRef.current = player;
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [mobilePage, setMobilePage] = useState<'study' | 'transcript'>('study');
  const isVideo = detectMediaType(source.url) === 'video';

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setCompact((entry?.contentRect.width ?? 1000) < 760));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const changeMode = (next: StudyMode) => {
    if (busy || next === mode) return;
    // An old detached practice leaf must release its replay monitor first.
    for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE_DICTATION)) leaf.detach();
    dispatchLpEvent('langplayer-stop-recording-playback');
    ui.getState().setStudyMode(next);
    setMobilePage('study');
  };

  return (
    <div ref={rootRef} className={`lp-view-root lp-studio lp-studio--${mode}${compact ? ' lp-studio--compact' : ''}`} data-mobile-page={mobilePage}>
      <header className="lp-studio-header">
        <button className="lp-brand-mark" onClick={plugin.openMediaPicker} aria-label={t('empty.openMedia')} title={t('empty.openMedia')}><Icon name="headphones" size={21} /></button>
        <div className="lp-studio-heading"><h1 title={source.displayName}>{source.displayName || t('app.name')}</h1></div>
        <div className="lp-mode-switch" role="group" aria-label={t('studio.mode')}>
          {modes.map(item => <button key={item.id} aria-label={t(item.label)} title={t(item.label)} aria-pressed={mode === item.id} disabled={busy || (item.id !== 'listen' && subtitles.length === 0)} onClick={() => changeMode(item.id)}><Icon name={item.icon} size={15} /><span>{t(item.label)}</span></button>)}
        </div>
        <div className="lp-studio-header-actions">
          <button className="lp-btn" onClick={() => void plugin.openVocabulary()} title={t('vocab.title')}><Icon name="book-open" /><span>{t('studio.words')}</span></button>
          <button className="lp-btn" onClick={onOpenNote} title={t('player.openNote')}><Icon name="file-text" /><span>{t('player.openNote')}</span></button>
        </div>
        <SubtitleDisplayMenu />
      </header>
      {compact && transcriptOpen && <div className="lp-mobile-switch" role="group" aria-label={t('studio.workspace')}>
        <button aria-pressed={mobilePage === 'study'} onClick={() => setMobilePage('study')}>{t('studio.study')}</button>
        <button aria-pressed={mobilePage === 'transcript'} onClick={() => setMobilePage('transcript')}>{t('studio.transcript')}</button>
      </div>}
      <div className={`lp-studio-body${transcriptOpen ? '' : ' lp-studio-body--solo'}`}>
        <main className="lp-studio-main" {...{ inert: compact && transcriptOpen && mobilePage === 'transcript' ? '' : undefined }}>
          <div className={`lp-studio-media${isVideo ? '' : ' lp-studio-media--audio'}`}>
            {isVideo ? <VideoLayout source={source} /> : <AudioLayout source={source} />}
          </div>
          <div className="lp-study-surface">
            {mode === 'dictation' ? <DictationPanel /> : <SentenceFocus shadow={mode === 'shadow'} audio={!isVideo} />}
          </div>
        </main>
        {transcriptOpen && <aside className="lp-studio-transcript" {...{ inert: compact && mobilePage === 'study' ? '' : undefined }}>
          <SubtitlePanel />
        </aside>}
      </div>
      <div className="lp-studio-transport"><PlaybackBar playerRef={playerRef} /></div>
    </div>
  );
}

function SubtitleDisplayMenu() {
  const ui = useStoreApi(useUIStore);
  const overlayMode = useUIStore(s => s.overlayMode);
  const showCurrentSentence = useUIStore(s => s.showCurrentSentence);
  const transcriptOpen = useUIStore(s => s.transcriptOpen);
  const lastOverlayMode = useRef(overlayMode === 'off' ? 'original' as const : overlayMode);
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (overlayMode !== 'off') lastOverlayMode.current = overlayMode;
  }, [overlayMode]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && menuRef.current) menuRef.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  return <details ref={menuRef} className="lp-subtitle-display" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key === 'Escape') {
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary className="lp-btn" aria-label={t('subtitle.toggleInline')} title={t('subtitle.toggleInline')}><Icon name="captions" size={16} /><span>{t('subtitle.toggleInline')}</span><Icon name="chevron-down" size={12} /></summary>
    <div className="lp-subtitle-display-menu">
      <label><input type="checkbox" checked={overlayMode !== 'off'} onChange={event => ui.getState().setOverlayMode(event.target.checked ? lastOverlayMode.current : 'off')} />{t('studio.videoSubtitles')}</label>
      <label><input type="checkbox" checked={showCurrentSentence} onChange={event => ui.getState().setShowCurrentSentence(event.target.checked)} />{t('studio.sentenceSubtitles')}</label>
      <label><input type="checkbox" checked={transcriptOpen} onChange={event => ui.getState().setTranscriptOpen(event.target.checked)} />{t('studio.sidebarSubtitles')}</label>
    </div>
  </details>;
}

function SentenceFocus({ shadow, audio }: { shadow: boolean; audio: boolean }) {
  const showCurrentSentence = useUIStore(s => s.showCurrentSentence);
  const cue = useSubtitleStore(selectCurrentSubtitle);
  const count = useSubtitleStore(s => s.subtitles.length);
  const activeIndex = useSubtitleStore(s => s.activeIndex);
  const { plugin, source, onMicClick } = useMediaView();
  const { playSegmentOnce } = usePlaybackMode();
  const recorderState = useRecordingStore(s => s.recorderState);
  const audioLevel = useRecordingStore(s => s.audioLevel);
  const lastRecording = useRecordingStore(s => s.lastRecording);
  const busy = recorderState !== 'idle';
  const [saving, setSaving] = useState(false);
  const [savedCue, setSavedCue] = useState<string | null>(null);
  const [translation, setTranslation] = useState(false);
  const dictationOpen = useDictationStore(s => s.dictationOpen);

  useEffect(() => { setTranslation(false); setSavedCue(null); }, [cue?.id, source?.url]);
  const save = async () => {
    if (!cue || saving) return;
    setSaving(true);
    try { if (await plugin.noteService.saveToNote(cue, source)) setSavedCue(cue.id); }
    catch { new Notice(t('notice.noteSaveFailed')); }
    finally { setSaving(false); }
  };
  if (!count) return <div className="lp-guided-empty"><Icon name="captions" size={28} /><h2>{t('studio.addTranscript')}</h2><p>{t('studio.addTranscriptHint')}</p><button className="lp-btn lp-btn-primary" onClick={plugin.loadSubtitleFromVault}><Icon name="plus" />{t('subtitle.loadFile')}</button></div>;
  return <section className={`lp-sentence-focus${audio ? ' lp-sentence-focus--audio' : ''}`}>
    <div className="lp-sentence-meta"><span className="lp-eyebrow">{t('studio.currentSentence')}</span><span>{activeIndex >= 0 ? String(activeIndex + 1).padStart(2, '0') : '—'} / {count}</span>{cue && <time>{formatTime(cue.start)}</time>}</div>
    {cue ? <>
      {showCurrentSentence && <div className="lp-focus-text"><ClickableText text={cue.textEn || cue.text} sentenceEn={cue.textEn || cue.text} sentenceZh={cue.textZh} cueStart={cue.start} /></div>}
      {showCurrentSentence && cue.textZh && <div className="lp-focus-translation">{translation ? <p>{cue.textZh}</p> : <button className="lp-text-button" onClick={() => setTranslation(true)}><Icon name="languages" size={14} />{t('studio.showTranslation')}</button>}</div>}
      <div className="lp-sentence-actions">
        <button className="lp-btn" disabled={busy} onClick={() => { dispatchLpEvent('langplayer-stop-recording-playback'); playSegmentOnce(cue); }}><Icon name="repeat" size={15} />{t('dictation.replay')}</button>
        <button className="lp-btn" disabled={saving} onClick={() => void save()}><Icon name={savedCue === cue.id ? 'check' : 'bookmark'} size={15} />{t(savedCue === cue.id ? 'studio.saved' : 'subtitle.saveToNote')}</button>
      </div>
    </> : <p className="lp-sentence-wait">{t('studio.betweenSentences')}</p>}
    {shadow && <div className="lp-shadow-studio">
      <div className="lp-shadow-heading"><span className="lp-eyebrow">{t('studio.yourVoice')}</span><span>{t('studio.shadowHelp')}</span></div>
      <div className="lp-record-capture">
        <button className={`lp-record-button${recorderState === 'recording' ? ' is-recording' : ''}`} disabled={recorderState === 'preparing' || recorderState === 'stopping' || !cue} onClick={onMicClick}><Icon name={recorderState === 'recording' ? 'square' : 'mic'} size={20} />{t(recorderState === 'recording' ? 'recording.stop' : recorderState === 'preparing' ? 'studio.preparingMic' : recorderState === 'stopping' ? 'studio.savingRecording' : 'recording.start')}</button>
        <div className="lp-level-meter" role="meter" aria-label={t('studio.micLevel')} aria-valuenow={Math.round(audioLevel * 100)} aria-valuemin={0} aria-valuemax={100}>{Array.from({ length: 20 }, (_, i) => <i key={i} className={audioLevel > i / 20 ? 'is-lit' : ''} />)}</div>
      </div>
      {!lastRecording && <p className="lp-record-help">{t('studio.recordHint')}</p>}
      {!dictationOpen && <RecordingPlayback />}
    </div>}
  </section>;
}
