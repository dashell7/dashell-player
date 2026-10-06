import { useStoreApi } from '../../store/mediaSession';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerRef, SubtitleCue } from '../../types';
import { usePlaybackStore } from '../../store/playbackStore';
import { useSubtitleStore, selectCurrentSubtitle } from '../../store/subtitleStore';
import { useLoopStore } from '../../store/loopStore';
import { useRecordingStore } from '../../store/recordingStore';
import { useDictationStore } from '../../store/dictationStore';
import { usePlaybackMode } from '../../hooks/usePlaybackMode';
import { useMediaView, useSettings } from '../../context';
import { useUIStore, type OverlayMode } from '../../store/uiStore';
import { formatTime } from '../../utils';
import { t } from '../../i18n';
import { Icon } from '../shared/Icon';
import { RecordingPlayback } from '../recording/RecordingPlayback';

/* ── Shared constants ── */
const ICON_SM   = 20;
const ICON_MD   = 20;
const ICON_PLAY = 24;

interface SubtitleControlsProps {
  playerRef: React.RefObject<PlayerRef | null>;
}

export function SubtitleControls({ playerRef }: SubtitleControlsProps) {
  const useLoopStoreApi = useStoreApi(useLoopStore);
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const useDictationStoreApi = useStoreApi(useDictationStore);
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const useUIStoreApi = useStoreApi(useUIStore);
  // NOTE: currentTime / duration are intentionally NOT subscribed here — they
  // change ~10×/sec during playback and would re-render this whole control bar.
  // They live in the small <ProgressBar> / <TimeDisplay> leaf components below.
  const playing      = usePlaybackStore((s) => s.playing);
  const playbackRate = usePlaybackStore((s) => s.playbackRate);
  const volume       = usePlaybackStore((s) => s.volume);
  const cue          = useSubtitleStore(selectCurrentSubtitle);
  const activeIndex  = useSubtitleStore((s) => s.activeIndex);
  const mode         = useLoopStore((s) => s.mode);
  const pointA       = useLoopStore((s) => s.pointA);
  const settings     = useSettings();
  const { plugin, source, onOpenNote, onMicClick } = useMediaView();
  const overlayMode  = useUIStore((s) => s.overlayMode);
  const recorderState  = useRecordingStore((s) => s.recorderState);
  const audioLevel     = useRecordingStore((s) => s.audioLevel);
  const { exitMode, startSegmentLoop, startABRepeat } = usePlaybackMode();

  const dictationOpen = useDictationStore((s) => s.dictationOpen);
  const practiceMode = useSubtitleStore((s) => s.practiceMode);

  const isSegmentLooping = mode.type === 'segmentLoop' || mode.type === 'infiniteLoop';
  const isRecordingBusy  =
    recorderState === 'preparing' || recorderState === 'recording' || recorderState === 'stopping';
  const isPlaybackModeLocked = practiceMode !== 'none' || isRecordingBusy;
  // Loop button is the only playback mode allowed during dictation
  // (audio cycles in background while user types).
  const isLoopLocked = practiceMode !== 'none' || isRecordingBusy;

  // ── Playback helpers ──────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    playing ? p.pauseVideo() : p.playVideo();
  }, [playing, playerRef]);

  /** Re-enter the current playback mode for a different subtitle cue. */
  const retargetMode = useCallback((sub: SubtitleCue) => {
    const { mode, enterMode } = useLoopStoreApi.getState();
    switch (mode.type) {
      case 'segmentLoop':
        enterMode({ type: 'segmentLoop', start: sub.start, end: sub.end, total: mode.total, current: 0, index: sub.index });
        break;
      case 'infiniteLoop':
        enterMode({ type: 'infiniteLoop', start: sub.start, end: sub.end });
        break;
    }
  }, []);

  const prevSub = useCallback(() => {
    const { subtitles, activeIndex } = useSubtitleStoreApi.getState();
    const idx = Math.max(0, activeIndex - 1);
    const sub = subtitles[idx];
    if (!sub) return;
    retargetMode(sub);
    if (useDictationStoreApi.getState().dictationOpen) {
      // Dictation panel observes activeIndex changes and handles playback
      useSubtitleStoreApi.getState().setActiveIndex(idx);
    } else if (playerRef.current) {
      playerRef.current.seekTo(sub.start, 'seconds');
      playerRef.current.playVideo();
    }
  }, [playerRef, retargetMode]);

  const nextSub = useCallback(() => {
    const { subtitles, activeIndex } = useSubtitleStoreApi.getState();
    const idx = Math.min(subtitles.length - 1, activeIndex + 1);
    const sub = subtitles[idx];
    if (!sub) return;
    retargetMode(sub);
    if (useDictationStoreApi.getState().dictationOpen) {
      useSubtitleStoreApi.getState().setActiveIndex(idx);
    } else if (playerRef.current) {
      playerRef.current.seekTo(sub.start, 'seconds');
      playerRef.current.playVideo();
    }
  }, [playerRef, retargetMode]);

  const toggleLoop = useCallback(() => {
    if (isLoopLocked || !cue) return;
    if (mode.type === 'segmentLoop' || mode.type === 'infiniteLoop') {
      exitMode();
      return;
    }
    startSegmentLoop(cue, settings.loopCount);
  }, [isLoopLocked, cue, mode.type, settings.loopCount, exitMode, startSegmentLoop]);

  const handleSetA = useCallback(() => {
    if (isPlaybackModeLocked) return;
    const now = usePlaybackStoreApi.getState().currentTime;
    useLoopStoreApi.getState().setPointA(now);
  }, [isPlaybackModeLocked]);

  const handleSetB = useCallback(() => {
    if (isPlaybackModeLocked) return;
    const a = useLoopStoreApi.getState().pointA;
    if (a !== null) startABRepeat(a, usePlaybackStoreApi.getState().currentTime);
  }, [isPlaybackModeLocked, startABRepeat]);

  const handleClearAB = useCallback(() => {
    useLoopStoreApi.getState().clearPoints();
    exitMode();
  }, [exitMode]);

  const cycleOverlayMode = useCallback(() => {
    useUIStoreApi.getState().cycleOverlayMode();
  }, []);

  const openSubtitlePanel = useCallback(() => {
    plugin.openSubtitlePanel().catch(() => {});
  }, [plugin]);

  // Avoid unused variable warning (activeIndex is observed for re-renders)
  void activeIndex;

  return (
    <div className="lp-controls">
      {/* ── Progress Bar ── */}
      <ProgressBar playerRef={playerRef} />

      {/* ── Controls Row ── */}
      <div className="lp-controls-row">
        {/* ── Group: Playback ── */}
        <div className="lp-ctrl-group">
          <button className="lp-ctrl-btn" onClick={prevSub} aria-label={t('player.prevSub')} title={t('player.prevSub')}>
            <Icon name="skip-back" size={ICON_MD} />
          </button>
          <button className="lp-ctrl-btn lp-ctrl-btn--play" onClick={togglePlay} aria-label={playing ? t('player.pause') : t('player.play')} title={`${playing ? t('player.pause') : t('player.play')} (Space)`}>
            <Icon name={playing ? 'pause' : 'play'} size={ICON_PLAY} />
          </button>
          <button className="lp-ctrl-btn" onClick={nextSub} aria-label={t('player.nextSub')} title={t('player.nextSub')}>
            <Icon name="skip-forward" size={ICON_MD} />
          </button>
        </div>

        <VolumeControl volume={volume} />

        <TimeDisplay />

        <div className="lp-ctrl-spacer" />

        {/* ── Group: Learning Tools ── */}
        <div className="lp-ctrl-group">
          <LoopButton
            isLooping={isSegmentLooping}
            mode={mode}
            loopCount={settings.loopCount}
            disabled={isLoopLocked}
            onToggle={toggleLoop}
            onSelectCount={(count) => {
              if (isLoopLocked || !cue) return;
              startSegmentLoop(cue, count);
            }}
          />

          {mode.type === 'abRepeat' ? (
            <button className="lp-ctrl-btn lp-ctrl-btn--active lp-ctrl-btn--label" onClick={handleClearAB} aria-label={t('mode.clearAB')} title={t('mode.clearAB')} aria-pressed={true} disabled={isPlaybackModeLocked}>
              <Icon name="x" size={ICON_SM} /> AB
            </button>
          ) : (
            <>
              <button
                className={`lp-ctrl-btn lp-ctrl-btn--label${pointA !== null ? ' lp-ctrl-btn--accent' : ''}`}
                onClick={handleSetA}
                aria-label={t('mode.setA')}
                title={t('mode.setA')}
                disabled={isPlaybackModeLocked}
              >
                {pointA !== null ? `A ${formatTime(pointA)}` : 'A'}
              </button>
              {pointA !== null && (
                <button className="lp-ctrl-btn lp-ctrl-btn--label" onClick={handleSetB} aria-label={t('mode.setB')} title={t('mode.setB')} disabled={isPlaybackModeLocked}>B</button>
              )}
            </>
          )}

          <span className="lp-ctrl-sep" />

          <button
            className={`lp-ctrl-btn${recorderState === 'recording' || recorderState === 'preparing' ? ' lp-ctrl-btn--recording' : ''}`}
            onClick={onMicClick}
            aria-label={recorderState === 'recording' || recorderState === 'preparing' ? t('recording.stop') : t('recording.start')}
            title={recorderState === 'recording' || recorderState === 'preparing' ? t('recording.stop') : t('recording.start')}
            aria-pressed={recorderState === 'recording' || recorderState === 'preparing'}
            style={
              recorderState === 'recording'
                ? { boxShadow: `0 0 ${Math.max(0, Math.min(1, audioLevel)) * 16}px color-mix(in srgb, var(--color-red, #dc3545) 60%, transparent)` }
                : undefined
            }
          >
            <Icon name="mic" size={ICON_SM} />
            {(recorderState === 'recording' || recorderState === 'preparing') && <span className="lp-rec-dot" />}
          </button>
        </div>

        <span className="lp-ctrl-sep" />

        {/* ── Group: View & Settings ── */}
        <div className="lp-ctrl-group">
          <PlaybackSpeedButton playbackRate={playbackRate} playerRef={playerRef} />

          <OverlayModeButton mode={overlayMode} onCycle={cycleOverlayMode} />

          <button className="lp-ctrl-btn" onClick={openSubtitlePanel} aria-label={t('subtitle.openPanel')} title={t('subtitle.openPanel')}>
            <Icon name="panel-right" size={ICON_MD} />
          </button>

          <button className="lp-ctrl-btn" onClick={onOpenNote} aria-label={t('player.openNote')} title={t('player.openNote')}>
            <Icon name="file-text" size={ICON_MD} />
          </button>

          <FullscreenButton />
        </div>
      </div>

      {/* Inline listen-back for the most recent recording. Shown here only when
          the dictation panel is NOT open — while dictating, the panel renders its
          own copy right under the input (so exactly one <audio> is ever mounted). */}
      {!dictationOpen && <RecordingPlayback />}
    </div>
  );
}

/** Aloud-style speed button with a 0.5–2.5x range popover. */
const PlaybackSpeedButton = React.memo(function PlaybackSpeedButton({
  playbackRate,
  playerRef,
}: {
  playbackRate: number;
  playerRef: React.RefObject<PlayerRef | null>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimer.current = null;
    }, 8000);
  }, [clearCloseTimer]);

  useEffect(() => {
    if (isOpen) scheduleClose();
    return clearCloseTimer;
  }, [isOpen, playbackRate, clearCloseTimer, scheduleClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isOpen]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const setRate = useCallback((value: number) => {
    const rate = Math.max(0.5, Math.min(2.5, Math.round(value / 0.05) * 0.05));
    usePlaybackStore.getState().setPlaybackRate(rate);
    playerRef.current?.setPlaybackRate(rate);
    scheduleClose();
  }, [playerRef, scheduleClose]);

  return (
    <div className="lp-speed-control" ref={rootRef}>
      <button
        type="button"
        className={`lp-ctrl-btn lp-ctrl-btn--label${isOpen ? ' lp-ctrl-btn--active' : ''}`}
        onClick={() => { setIsOpen((open) => !open); clearCloseTimer(); }}
        aria-label={t('player.speed')}
        aria-expanded={isOpen}
        title={t('player.speed')}
      >
        {playbackRate.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}x
      </button>
      {isOpen && (
        <div className="lp-speed-popover" role="dialog" aria-label={t('player.speed')}>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.05"
            value={playbackRate}
            onChange={(event) => setRate(Number(event.target.value))}
            aria-label={t('player.speed')}
          />
          <output>{playbackRate.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}x</output>
        </div>
      )}
    </div>
  );
});

/** Fullscreen toggle button. Hidden where element fullscreen is unavailable
 *  (iOS WKWebView) instead of rendering a button that silently does nothing. */
function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const supported = typeof document !== 'undefined' && !!document.fullscreenEnabled;

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggle = useCallback(() => {
    const card = document.querySelector('.lp-player-card');
    if (!card) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      card.requestFullscreen().catch(() => {});
    }
  }, []);

  // After all hooks (rules-of-hooks): hide entirely when unsupported.
  if (!supported) return null;

  return (
    <button className="lp-ctrl-btn" onClick={toggle} aria-label={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')} title={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}>
      <Icon name={isFullscreen ? 'minimize' : 'maximize'} size={ICON_MD} />
    </button>
  );
}

/** Loop button with right-click menu for quick loop count selection */
function LoopButton({ isLooping, mode, loopCount, disabled, onToggle, onSelectCount }: {
  isLooping: boolean;
  mode: import('../../types/playback').PlaybackMode;
  loopCount: number;
  disabled?: boolean;
  onToggle: () => void;
  onSelectCount: (count: number) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const btnRef    = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const LOOP_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100];

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled) return;
    setShowMenu((v) => !v);
  }, [disabled]);

  useEffect(() => {
    if (showMenu && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
  }, [showMenu]);

  const selectCount = useCallback((count: number) => {
    setShowMenu(false);
    onSelectCount(count);
  }, [onSelectCount]);

  const activeTotal = mode.type === 'segmentLoop' ? mode.total : loopCount;

  return (
    <>
      <button
        ref={btnRef}
        className={`lp-ctrl-btn lp-ctrl-btn--label${isLooping ? ' lp-ctrl-btn--active' : ''}`}
        onClick={() => { if (!disabled) onToggle(); }}
        onContextMenu={handleContextMenu}
        aria-label={`${t('mode.loopBtn')} (${t('mode.loopBtnHint')})`}
        title={`${t('mode.loopBtn')} (${t('mode.loopBtnHint')})`}
        aria-pressed={isLooping}
        disabled={disabled}
      >
        <Icon name="repeat" size={ICON_SM} />
        {mode.type === 'segmentLoop' && (
          <span className="lp-ctrl-badge">{mode.current + 1}/{mode.total}</span>
        )}
      </button>

      {showMenu && menuPos && createPortal(
        <>
          <div className="lp-popup-backdrop" onClick={() => setShowMenu(false)} />
          <div className="lp-popup-menu" style={{ left: menuPos.x, top: menuPos.y }}>
            {LOOP_OPTIONS.map((count) => (
              <div
                key={count}
                role="button"
                tabIndex={0}
                className={`lp-popup-item${activeTotal === count ? ' lp-popup-item--active' : ''}`}
                onClick={() => selectCount(count)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCount(count); } }}
              >
                <span>{count} {t('mode.loopTimes')}</span>
                {activeTotal === count && <Icon name="check" size={12} />}
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Inline horizontal volume control: icon + expandable pill slider (Media Extended style) */
const VolumeControl = React.memo(function VolumeControl({ volume }: { volume: number }) {
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const [expanded, setExpanded] = useState(false);
  const prevVolume   = React.useRef(0.5);
  const collapseTimer = useRef<number | null>(null);
  const trackRef     = useRef<HTMLDivElement>(null);
  const dragging     = useRef(false);

  const scheduleCollapse = useCallback(() => {
    if (collapseTimer.current) window.clearTimeout(collapseTimer.current);
    collapseTimer.current = window.setTimeout(() => {
      if (!dragging.current) setExpanded(false);
    }, 800);
  }, []);

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current) window.clearTimeout(collapseTimer.current);
  }, []);

  const handleEnter = useCallback(() => {
    cancelCollapse();
    setExpanded(true);
  }, [cancelCollapse]);

  const handleLeave = useCallback(() => {
    scheduleCollapse();
  }, [scheduleCollapse]);

  useEffect(() => {
    return () => { if (collapseTimer.current) window.clearTimeout(collapseTimer.current); };
  }, []);

  const toggleMute = useCallback(() => {
    if (volume > 0) {
      prevVolume.current = volume;
      usePlaybackStoreApi.getState().setVolume(0);
    } else {
      usePlaybackStoreApi.getState().setVolume(prevVolume.current || 0.5);
    }
  }, [volume]);

  const setVolumeFromEvent = useCallback((e: { clientX: number }) => {
    const track = trackRef.current;
    if (!track) return;
    const rect  = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    usePlaybackStoreApi.getState().setVolume(Math.round(ratio * 20) / 20);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragging.current = true;
    cancelCollapse();
    setVolumeFromEvent(e.nativeEvent);

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) setVolumeFromEvent(ev);
    };
    const onUp   = () => {
      dragging.current = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      scheduleCollapse();
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }, [cancelCollapse, scheduleCollapse, setVolumeFromEvent]);

  const iconName = volume === 0 ? 'volume-x' : volume < 0.5 ? 'volume' : 'volume-2';
  const pct      = Math.round(volume * 100);

  return (
    <div
      className="lp-volume-wrap"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <button className="lp-ctrl-btn" onClick={toggleMute} aria-label={t('player.volume')} aria-pressed={volume === 0}>
        <Icon name={iconName} size={ICON_MD} />
      </button>
      <div className={`lp-volume-inline${expanded ? ' lp-volume-inline--open' : ''}`}>
        <div
          ref={trackRef}
          className="lp-vol-track"
          onPointerDown={handlePointerDown}
          role="slider"
          aria-label={t('player.volume')}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
        >
          <div className="lp-vol-fill" style={{ width: `${pct}%` }} />
          <div className="lp-vol-thumb" style={{ left: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
});

/** Overlay mode cycle button — cycles: auto → original → bilingual → translation → off */
const OverlayModeButton = React.memo(function OverlayModeButton({
  mode, onCycle,
}: { mode: OverlayMode; onCycle: () => void }) {
  const isOff  = mode === 'off';
  const badge  =
    mode === 'original'    ? t('subtitle.overlayOriginalBadge') :
    mode === 'translation' ? t('subtitle.overlayTranslationBadge') : null;

  const label =
    mode === 'auto'        ? t('subtitle.overlayAuto') :
    mode === 'original'    ? t('subtitle.overlayOriginal') :
    mode === 'translation' ? t('subtitle.overlayTranslation') :
    t('subtitle.overlayOff');

  return (
    <button
      className={`lp-ctrl-btn${isOff ? ' lp-ctrl-btn--dim' : ''}`}
      onClick={onCycle}
      aria-label={label}
      title={label}
    >
      <Icon name={isOff ? 'eye-off' : 'eye'} size={ICON_MD} />
      {badge && <span className="lp-ctrl-badge">{badge}</span>}
    </button>
  );
});

/** Progress bar + scrub/seek + hover tooltip. Isolated into its own memoized
 *  leaf so the ~10Hz currentTime updates only re-render this small node, not the
 *  entire control bar (volume, loop, AB, speed, etc.). */
const ProgressBar = React.memo(function ProgressBar({ playerRef }: SubtitleControlsProps) {
  const useDictationStoreApi = useStoreApi(useDictationStore);
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration    = usePlaybackStore((s) => s.duration);

  const progress       = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDragging     = useRef(false);
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [hoverTime, setHoverTime]       = useState<{ time: number; x: number } | null>(null);

  const getRatioFromClientX = useCallback((clientX: number) => {
    const bar = progressBarRef.current;
    if (!bar) return null;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleProgressPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    isDragging.current = true;
    const ratio = getRatioFromClientX(e.clientX);
    if (ratio !== null) setDragProgress(ratio * 100);
  }, [getRatioFromClientX]);

  const handleProgressPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) {
      if (duration && e.pointerType === 'mouse') {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        setHoverTime({ time: ratio * duration, x: e.clientX - rect.left });
      }
      return;
    }
    const r = getRatioFromClientX(e.clientX);
    if (r !== null) setDragProgress(r * 100);
  }, [getRatioFromClientX, duration]);

  const handleProgressPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const r = getRatioFromClientX(e.clientX);
    if (r !== null && playerRef.current && duration) {
      const seekTime = r * duration;
      playerRef.current.seekTo(seekTime, 'seconds');

      // While a practice view is open, activeIndex is locked, so a
      // manual scrub wouldn't re-target the dictation sentence — pressing Space
      // would replay the OLD locked cue (jumping back). Re-lock dictation onto the
      // cue at the scrubbed position so "drag here → dictate from here" works.
      if (useDictationStoreApi.getState().dictationOpen) {
        const { subtitles } = useSubtitleStoreApi.getState();
        // Prefer the cue whose span contains the time; else the next upcoming cue.
        let idx = subtitles.findIndex((c) => seekTime >= c.start && seekTime <= c.end);
        if (idx < 0) idx = subtitles.findIndex((c) => c.start >= seekTime);
        if (idx < 0) idx = subtitles.length - 1; // past the last cue → last sentence
        if (idx >= 0) useSubtitleStoreApi.getState().setActiveIndex(idx);
      }
    }
    setDragProgress(null);
  }, [getRatioFromClientX, duration, playerRef]);

  const displayProgress = dragProgress ?? progress;

  return (
    <div
      className={`lp-progress-wrap${dragProgress !== null ? ' lp-progress-wrap--dragging' : ''}`}
      onPointerDown={handleProgressPointerDown}
      onPointerMove={handleProgressPointerMove}
      onPointerUp={handleProgressPointerUp}
      onPointerLeave={() => { if (!isDragging.current) setHoverTime(null); }}
    >
      {hoverTime && !isDragging.current && (
        <div className="lp-progress-tooltip" style={{ left: hoverTime.x }}>
          {formatTime(hoverTime.time)}
        </div>
      )}
      <div
        ref={progressBarRef}
        className="lp-progress-bar"
        role="progressbar"
        aria-valuenow={Math.round(displayProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="lp-progress-fill" style={{ width: `${displayProgress}%` }} />
      </div>
    </div>
  );
});

/** Current / total time readout. Isolated for the same reason as ProgressBar. */
const TimeDisplay = React.memo(function TimeDisplay() {
  const currentTime = usePlaybackStore((s) => s.currentTime);
  const duration    = usePlaybackStore((s) => s.duration);
  return (
    <time className="lp-time-display">
      {formatTime(currentTime)}<span className="lp-time-sep" />{formatTime(duration)}
    </time>
  );
});
