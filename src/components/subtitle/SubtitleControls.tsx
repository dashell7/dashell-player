import React, { useEffect, useId, useRef, useState } from 'react';
import type { PlayerRef } from '../../types';
import { useStoreApi } from '../../store/mediaSession';
import { usePlaybackStore } from '../../store/playbackStore';
import { selectCurrentSubtitle, useSubtitleStore } from '../../store/subtitleStore';
import { useLoopStore } from '../../store/loopStore';
import { useRecordingStore } from '../../store/recordingStore';
import { useDictationStore } from '../../store/dictationStore';
import { useUIStore, type OverlayMode } from '../../store/uiStore';
import { useMediaView } from '../../context';
import { usePlaybackMode } from '../../hooks/usePlaybackMode';
import { dispatchLpEvent } from '../../constants/events';
import { RecordingPlayback } from '../recording/RecordingPlayback';
import { Icon } from '../shared/Icon';
import { formatTime } from '../../utils';
import { t } from '../../i18n';

interface SubtitleControlsProps { playerRef: React.RefObject<PlayerRef | null> }

export function SubtitleControls({ playerRef }: SubtitleControlsProps) {
  const playback = useStoreApi(usePlaybackStore);
  const subtitle = useStoreApi(useSubtitleStore);
  const loop = useStoreApi(useLoopStore);
  const ui = useStoreApi(useUIStore);
  const playing = usePlaybackStore(s => s.playing);
  const readiness = usePlaybackStore(s => s.readiness);
  const rate = usePlaybackStore(s => s.playbackRate);
  const volume = usePlaybackStore(s => s.volume);
  const cue = useSubtitleStore(selectCurrentSubtitle);
  const cueCount = useSubtitleStore(s => s.subtitles.length);
  const mode = useLoopStore(s => s.mode);
  const pointA = useLoopStore(s => s.pointA);
  const recorder = useRecordingStore(s => s.recorderState);
  const dictation = useDictationStore(s => s.dictationOpen);
  const overlay = useUIStore(s => s.overlayMode);
  const studyMode = useUIStore(s => s.studyMode);
  const { plugin, settings, onMicClick } = useMediaView();
  const { startSegmentLoop, startInfiniteLoop, startABRepeat, exitMode } = usePlaybackMode();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const lastVolume = useRef(1);
  const labelId = useId();
  const recordingBusy = recorder !== 'idle';
  const ready = readiness === 'ready' || readiness === 'buffering';
  const looping = mode.type === 'segmentLoop' || mode.type === 'infiniteLoop';

  useEffect(() => {
    const doc = rootRef.current?.ownerDocument ?? document;
    const close = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) menuRef.current?.removeAttribute('open'); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuRef.current?.open) {
        event.stopPropagation();
        menuRef.current.open = false;
        menuRef.current.querySelector('summary')?.focus();
      }
    };
    const changed = () => setFullscreen(!!doc.fullscreenElement);
    doc.addEventListener('pointerdown', close);
    doc.addEventListener('keydown', escape, true);
    doc.addEventListener('fullscreenchange', changed);
    return () => { doc.removeEventListener('pointerdown', close); doc.removeEventListener('keydown', escape, true); doc.removeEventListener('fullscreenchange', changed); };
  }, []);

  const navigate = (direction: 'previous' | 'next') => {
    dispatchLpEvent('langplayer-stop-recording-playback');
    if (dictation) { dispatchLpEvent('lp-practice-navigate', { direction }); return; }
    const state = subtitle.getState();
    const now = playback.getState().currentTime;
    const candidate = state.activeIndex >= 0
      ? state.activeIndex + (direction === 'next' ? 1 : -1)
      : direction === 'next'
        ? state.subtitles.findIndex(item => item.start >= now)
        : state.subtitles.reduce((previous, item, index) => item.end <= now ? index : previous, -1);
    const index = Math.max(0, Math.min(state.subtitles.length - 1, candidate < 0 && direction === 'next' ? state.subtitles.length - 1 : candidate));
    const target = state.subtitles[index];
    if (!target) return;
    if (mode.type === 'segmentLoop') startSegmentLoop(target, mode.total);
    else if (mode.type === 'infiniteLoop') startInfiniteLoop(target);
    else {
      exitMode();
      state.setActiveIndex(index);
      playerRef.current?.seekTo(target.start);
      playerRef.current?.playVideo();
    }
  };
  const togglePlay = () => {
    if (playing) { playerRef.current?.pauseVideo(); return; }
    dispatchLpEvent('langplayer-stop-recording-playback');
    if (dictation) dispatchLpEvent('lp-practice-navigate', { direction: 'replay' });
    else playerRef.current?.playVideo();
  };
  const toggleAB = () => {
    if (mode.type === 'abRepeat') { loop.getState().clearPoints(); exitMode(); }
    else if (pointA === null) loop.getState().setPointA(playback.getState().currentTime);
    else {
      const now = playback.getState().currentTime;
      if (now > pointA) startABRepeat(pointA, now);
    }
  };
  const toggleFullscreen = () => {
    const root = rootRef.current?.closest('.lp-studio') ?? rootRef.current?.closest('.lp-player-card');
    const doc = rootRef.current?.ownerDocument ?? document;
    if (doc.fullscreenElement) void doc.exitFullscreen();
    else if (root instanceof HTMLElement) void root.requestFullscreen();
  };

  return <div className="lp-controls" ref={rootRef}>
    <ProgressBar playerRef={playerRef} />
    {recordingBusy && studyMode !== 'shadow' && <div className="lp-recording-strip" role="status"><Icon name="mic" size={15}/><span>{t(recorder === 'preparing' ? 'studio.preparingMic' : recorder === 'stopping' ? 'studio.savingRecording' : 'studio.recording')}</span><button className="lp-btn" disabled={recorder !== 'recording'} onClick={onMicClick}><Icon name="square" size={12}/>{t('recording.stop')}</button></div>}
    <div className="lp-controls-row">
      <div className="lp-transport-context"><Icon name="headphones" size={17} /><TimeDisplay /></div>
      <div className="lp-transport-buttons">
        <button className="lp-ctrl-btn" onClick={() => navigate('previous')} disabled={!cueCount || recordingBusy} aria-label={t('player.prevSub')} title={t('player.prevSub')}><Icon name="skip-back" size={19} /></button>
        <button className="lp-ctrl-btn lp-ctrl-btn--play" onClick={togglePlay} disabled={!ready || recordingBusy} aria-label={t(playing ? 'player.pause' : 'player.play')} title={t(playing ? 'player.pause' : 'player.play')}><Icon name={playing ? 'pause' : 'play'} size={22} /></button>
        <button className="lp-ctrl-btn" onClick={() => navigate('next')} disabled={!cueCount || recordingBusy} aria-label={t('player.nextSub')} title={t('player.nextSub')}><Icon name="skip-forward" size={19} /></button>
      </div>
      <div className="lp-transport-tools">
        <button className={`lp-ctrl-btn lp-loop-quick${looping ? ' is-active' : ''}`} disabled={!cue || recordingBusy || dictation} aria-pressed={looping} aria-label={t('mode.loopBtn')} title={t('mode.loopBtn')} onClick={() => { if (looping) exitMode(); else if (cue) startSegmentLoop(cue, settings.loopCount); }}><Icon name="repeat" size={16} /><span>{mode.type === 'segmentLoop' ? `${mode.current + 1}/${mode.total}` : t('mode.loop')}</span></button>
        <label className="lp-rate-control"><span className="lp-sr-only">{t('player.speed')}</span><select value={rate} disabled={recordingBusy} onChange={e => playback.getState().setPlaybackRate(Number(e.target.value))}>{Array.from(new Set([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, rate])).sort((a,b)=>a-b).map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
        <details className="lp-transport-menu" ref={menuRef}>
          <summary className="lp-ctrl-btn" aria-label={t('studio.more')} title={t('studio.more')}><Icon name="settings" size={18} /></summary>
          <div className="lp-transport-popover" aria-labelledby={labelId}>
            <div className="lp-popover-title" id={labelId}>{t('player.controls')}</div>
            <label className="lp-control-field"><span>{t('player.speed')}</span><input type="range" min="0.5" max="2.5" step="0.05" value={rate} onChange={e => playback.getState().setPlaybackRate(Number(e.target.value))} /><output>{rate.toFixed(2)}×</output></label>
            <div className="lp-control-field"><button className="lp-ctrl-btn" aria-label={t('player.volume')} aria-pressed={volume === 0} onClick={() => { if (volume > 0) lastVolume.current = volume; playback.getState().setVolume(volume ? 0 : lastVolume.current); }}><Icon name={volume ? 'volume-2' : 'volume-x'} size={16} /></button><input aria-label={t('player.volume')} type="range" min="0" max="1" step="0.05" value={volume} onChange={e => playback.getState().setVolume(Number(e.target.value))} /><output>{Math.round(volume * 100)}%</output></div>
            <label className="lp-control-field"><span>{t('subtitle.inlineShort')}</span><select value={overlay} disabled={dictation} onChange={e => ui.getState().setOverlayMode(e.target.value as OverlayMode)}>{(['auto','original','bilingual','translation','off'] as const).map(value => <option key={value} value={value}>{t(value === 'auto' ? 'subtitle.overlayAuto' : value === 'original' ? 'subtitle.overlayOriginal' : value === 'bilingual' ? 'subtitle.overlayBilingual' : value === 'translation' ? 'subtitle.overlayTranslation' : 'subtitle.overlayOff')}</option>)}</select></label>
            <label className="lp-control-field"><span>{t('mode.loopBtn')}</span><select disabled={!cue || dictation || recordingBusy} value={mode.type === 'segmentLoop' ? mode.total : 0} onChange={e => { const n = Number(e.target.value); if (n && cue) startSegmentLoop(cue, n); else exitMode(); }}><option value="0">{t('subtitle.overlayOff')}</option>{Array.from(new Set([1,2,3,5,10,20,50,100,settings.loopCount,mode.type === 'segmentLoop' ? mode.total : settings.loopCount])).sort((a,b)=>a-b).map(n => <option key={n} value={n}>{n} {t('mode.loopTimes')}</option>)}</select></label>
            <button className="lp-menu-action" disabled={dictation || recordingBusy || !ready} onClick={toggleAB}><Icon name="repeat" size={16} />{mode.type === 'abRepeat' ? t('mode.clearAB') : pointA === null ? t('mode.setA') : `${t('mode.setB')} · A ${formatTime(pointA)}`}</button>
            {pointA !== null && mode.type !== 'abRepeat' && <button className="lp-menu-action" onClick={() => loop.getState().clearPoints()}>{t('mode.clearAB')}</button>}
            <button className="lp-menu-action" onClick={onMicClick} disabled={recorder === 'preparing' || recorder === 'stopping'}><Icon name="mic" size={16} />{t(recorder === 'recording' ? 'recording.stop' : 'recording.start')}</button>
            <button className="lp-menu-action" onClick={() => void plugin.openSubtitlePanel()}><Icon name="external-link" size={16} />{t('studio.detachTranscript')}</button>
            {document.fullscreenEnabled && <button className="lp-menu-action" onClick={toggleFullscreen}><Icon name={fullscreen ? 'minimize' : 'maximize'} size={16} />{t(fullscreen ? 'player.exitFullscreen' : 'player.fullscreen')}</button>}
          </div>
        </details>
      </div>
    </div>
    {!dictation && studyMode !== 'shadow' && <RecordingPlayback />}
  </div>;
}

const ProgressBar = React.memo(function ProgressBar({ playerRef }: SubtitleControlsProps) {
  const current = usePlaybackStore(s => s.currentTime);
  const duration = usePlaybackStore(s => s.duration);
  const mode = useLoopStore(s => s.mode);
  const pointA = useLoopStore(s => s.pointA);
  const subtitle = useStoreApi(useSubtitleStore);
  const dictation = useDictationStore(s => s.dictationOpen);
  const busy = useRecordingStore(s => s.recorderState !== 'idle');
  const [draft, setDraft] = useState<number | null>(null);
  const commit = (value: number) => {
    playerRef.current?.seekTo(value);
    if (dictation) {
      const state = subtitle.getState();
      let index = state.subtitles.findIndex(cue => cue.end >= value);
      if (index < 0) index = state.subtitles.length - 1;
      if (index >= 0) state.setActiveIndex(index);
    }
    setDraft(null);
  };
  const progress = duration > 0 ? (draft ?? current) / duration * 100 : 0;
  return <div className="lp-progress-wrap">
    {duration > 0 && mode.type === 'abRepeat' && <div className="lp-ab-range" style={{left:`${mode.pointA/duration*100}%`, width:`${(mode.pointB-mode.pointA)/duration*100}%`}}><span>A</span><span>B</span></div>}
    {duration > 0 && pointA !== null && mode.type !== 'abRepeat' && <span className="lp-ab-marker" style={{ left: `${pointA/duration*100}%` }}>A</span>}
    <input className="lp-progress-slider" type="range" aria-label={t('studio.seek')} aria-valuetext={`${formatTime(draft ?? current)} / ${formatTime(duration)}`} min="0" max={duration || 1} step="0.1" disabled={!duration || busy} value={draft ?? current} style={{ '--lp-progress': `${progress}%` } as React.CSSProperties} onChange={e => setDraft(Number(e.target.value))} onPointerUp={e => commit(Number(e.currentTarget.value))} onPointerCancel={() => setDraft(null)} onKeyUp={e => { if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)) commit(Number(e.currentTarget.value)); }} onBlur={e => { if (draft !== null) commit(Number(e.currentTarget.value)); }} />
  </div>;
});
const TimeDisplay = React.memo(function TimeDisplay() {
  const current = usePlaybackStore(s => s.currentTime);
  const duration = usePlaybackStore(s => s.duration);
  return <time className="lp-time-display">{formatTime(current)}<span> / {formatTime(duration)}</span></time>;
});
