/**
 * RecordingPlayback — inline "listen back" control that shows up after a
 * recording finishes. Renders a play/pause button with elapsed time, a
 * now-playing indicator (原声 / 我的), the original subtitle, and a dismiss
 * button. Reads from `useRecordingStore.lastRecording`.
 *
 * A/B comparison ergonomics:
 *  - Hotkey `langplayer-toggle-recording-playback` (dispatched by DictationPanel
 *    when the `playRecording` key fires) toggles play/pause hands-free.
 *  - Mutual exclusion: starting my-recording playback pauses the video
 *    (original); starting the original (DictationPanel) dispatches
 *    `langplayer-stop-recording-playback` which pauses my recording here.
 *    So the two sources never overlap.
 *  - Auto-play: when a fresh recording arrives while a dictation session is
 *    open, it plays back once automatically (mutual exclusion keeps it from
 *    colliding with the original).
 *  - Focus: after any toggle/finish, focus returns to the dictation hidden
 *    input so Space (replay original) keeps being captured by the panel
 *    instead of leaking to the video player.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRecordingStore } from '../../store/recordingStore';
import { usePlaybackStore } from '../../store/playbackStore';
import { useDictationStore } from '../../store/dictationStore';
import { Icon } from '../shared/Icon';
import { t } from '../../i18n';
import { onLpEvent } from '../../constants/events';

const DICTATION_HIDDEN_INPUT_SELECTOR = '.lp-dictation-hidden-input';

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Pause the video/original so it never overlaps recording playback. */
function pauseOriginal(): void {
  usePlaybackStore.getState().playerRef?.pauseVideo();
}

/** Move focus back to the dictation hidden input so the dictation panel's
 *  Space/Tab/etc. hotkeys keep being captured (instead of falling through
 *  to the underlying video player). No-op if there is no dictation panel. */
function refocusDictationInput(): void {
  window.setTimeout(() => {
    const el = document.querySelector<HTMLInputElement>(DICTATION_HIDDEN_INPUT_SELECTOR);
    if (!el || document.activeElement === el) return;
    el.focus({ preventScroll: true });
  }, 0);
}

export function RecordingPlayback() {
  const lastRecording = useRecordingStore((s) => s.lastRecording);
  const originalPlaying = usePlaybackStore((s) => s.playing);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  // When a new recording arrives during a dictation session, play it back once.
  const autoPlayPendingRef = useRef(false);

  // Reset playback state whenever the recording changes (a new recording arrived).
  // If a dictation session is open, arm a one-shot auto-play (fired from onCanPlay
  // once the new blob is ready).
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    // Auto-play my recording when a dictation session is open AND DictationPanel
    // will NOT itself auto-replay the original. Its replay effect only fires for
    // phases 'idle' / 'playing', so the complement (awaitInput / correct /
    // incorrectLocked / done) is exactly when we can safely auto-play mine
    // without the two audio sources fighting. Otherwise we yield and let the
    // user press the playRecording key.
    const ds = useDictationStore.getState();
    autoPlayPendingRef.current =
      !!lastRecording && ds.dictationOpen && ds.phase !== 'idle' && ds.phase !== 'playing';
  }, [lastRecording?.url]);

  const startPlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    pauseOriginal(); // mutual exclusion: never stack over the original
    if (el.currentTime >= el.duration - 0.05) el.currentTime = 0;
    el.play().catch(() => { /* autoplay restrictions — ignore */ });
  }, []);

  // Fire the armed one-shot auto-play once the new blob is ready. Triggered from
  // both onLoadedMetadata (reliable with preload="metadata") and onCanPlay
  // (backup); the pending flag guarantees it plays at most once per recording.
  const maybeAutoPlay = useCallback(() => {
    if (!autoPlayPendingRef.current) return;
    autoPlayPendingRef.current = false;
    startPlayback();
  }, [startPlayback]);

  const togglePlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused && !el.ended) {
      el.pause();
    } else {
      startPlayback();
    }
  }, [startPlayback]);

  const handleTogglePlay = useCallback(() => {
    togglePlayback();
    refocusDictationInput();
  }, [togglePlayback]);

  const handleDismiss = useCallback(() => {
    useRecordingStore.getState().clearLastRecording();
    refocusDictationInput();
  }, []);

  // External hotkey dispatcher (DictationPanel `playRecording` key): toggle audio.
  useEffect(() => {
    return onLpEvent('langplayer-toggle-recording-playback', () => {
      togglePlayback();
      refocusDictationInput();
    });
  }, [togglePlayback]);

  // Mutual exclusion: when the original starts (DictationPanel replay) or a new
  // recording starts capturing, force-pause my recording playback.
  useEffect(() => {
    return onLpEvent('langplayer-stop-recording-playback', () => { audioRef.current?.pause(); });
  }, []);

  if (!lastRecording) return null;

  const displayTime = playing || currentTime > 0 ? currentTime : lastRecording.durationSec;
  const nowPlaying: 'mine' | 'original' | null = playing ? 'mine' : originalPlaying ? 'original' : null;

  return (
    <div className="lp-rec-playback" role="region" aria-label="Recording playback">
      <button
        className={`lp-rec-playback-btn${playing ? ' lp-rec-playback-btn--playing' : ''}`}
        onClick={handleTogglePlay}
        aria-label={playing ? 'Pause recording' : 'Play recording'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={14} />
      </button>
      <span
        className={`lp-rec-playback-now${nowPlaying ? ` lp-rec-playback-now--${nowPlaying}` : ''}`}
        aria-live="polite"
      >
        {nowPlaying === 'mine' ? t('rec.srcMine') : nowPlaying === 'original' ? t('rec.srcOriginal') : ''}
      </span>
      <span className="lp-rec-playback-time">
        {formatTime(displayTime)}
        {lastRecording.durationSec > 0 && (
          <span className="lp-rec-playback-time-total"> / {formatTime(lastRecording.durationSec)}</span>
        )}
      </span>
      <span className="lp-rec-playback-spacer" />
      <button
        className="lp-rec-playback-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss recording playback"
      >
        <Icon name="x" size={12} />
      </button>
      <audio
        ref={audioRef}
        src={lastRecording.url}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); refocusDictationInput(); }}
        onEnded={() => { setPlaying(false); refocusDictationInput(); }}
        onLoadedMetadata={maybeAutoPlay}
        onCanPlay={maybeAutoPlay}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        preload="metadata"
        className="lp-hidden-media"
      />
    </div>
  );
}
