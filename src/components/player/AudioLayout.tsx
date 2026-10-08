import { useMediaSessionId, useStoreApi } from '../../store/mediaSession';
import React, { useRef, useEffect } from 'react';
import { Platform } from 'obsidian';
import type { PlayerRef, MediaSource } from '../../types';
import { MediaPlaybackStatus, MediaPlayer } from './MediaPlayer';
import { notifyPlaybackBarActivity, PlaybackBar } from '../subtitle/PlaybackBar';
import { ClickableText } from '../subtitle/ClickableText';
import { useMediaSync } from '../../hooks/useMediaSync';
import { usePlaybackModeEvents } from '../../hooks/usePlaybackModeEvents';
import { usePlayerReady } from '../../hooks/usePlayerReady';
import { usePlaybackStore } from '../../store/playbackStore';
import { useSubtitleStore, selectCurrentSubtitle } from '../../store/subtitleStore';
import { useUIStore } from '../../store/uiStore';

interface AudioLayoutProps {
  source: MediaSource;
}

export function AudioLayout({ source }: AudioLayoutProps) {
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const mediaSessionId = useMediaSessionId();
  const playerRef = useRef<PlayerRef>(null);

  useMediaSync(playerRef);

  // Wire loop / AB-repeat commands (shared with VideoLayout) — previously
  // missing here, so loop/AB commands silently did nothing in audio mode.
  usePlaybackModeEvents();

  const handleReady = usePlayerReady(playerRef, source);

  // Hover-based keyboard shortcuts — same as VideoLayout (desktop only)
  const isMouseOver = useRef(false);
  useEffect(() => {
    if (Platform.isMobile) return;
    const handler = (e: KeyboardEvent) => {
      if (!isMouseOver.current) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.querySelector('.modal-container, .modal-bg')) return;

      const p = playerRef.current;
      if (!p) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        usePlaybackStoreApi.getState().playing ? p.pauseVideo() : p.playVideo();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        p.seekTo(Math.max(0, p.getCurrentTime() - 5), 'seconds');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        p.seekTo(Math.min(usePlaybackStoreApi.getState().duration, p.getCurrentTime() + 5), 'seconds');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="lp-audio-layout"
      onMouseEnter={() => { isMouseOver.current = true; }}
      onMouseLeave={() => { isMouseOver.current = false; }}
      onMouseMove={() => notifyPlaybackBarActivity(mediaSessionId)}
    >
      {/* Audio element — no controls, so it renders at 0px height and is invisible.
          Must NOT be inside display:none — Chromium/Electron suspends the audio
          pipeline for elements inside hidden containers, causing silent playback. */}
      <MediaPlayer
        ref={playerRef}
        source={source}
        mediaType="audio"
        onReady={handleReady}
      />

      {/* Visual area */}
      <AudioVisualArea source={source} />
      <MediaPlaybackStatus onRetry={() => playerRef.current?.reload()} />

      {/* The same Aloud-style toolbar shell is used for audio and video. */}
      <PlaybackBar playerRef={playerRef} />
    </div>
  );
}

function AudioVisualArea({ source }: { source: MediaSource }) {
  const cue = useSubtitleStore(selectCurrentSubtitle);
  const config = useSubtitleStore((s) => s.config);
  const overlayMode = useUIStore((s) => s.overlayMode);

  // Use same display logic as SubtitleOverlay
  let showEn = false;
  let showZh = false;
  let showText = false;

  if (cue) {
    if (overlayMode === 'off') {
      // Show nothing
    } else if (overlayMode === 'original') {
      if (cue.textEn) { showEn = true; } else { showText = true; }
    } else if (overlayMode === 'bilingual') {
      if (cue.textEn) { showEn = true; } else { showText = true; }
      showZh = !!cue.textZh;
    } else if (overlayMode === 'translation') {
      showZh = !!cue.textZh;
      if (!showZh) { showText = true; }
    } else {
      // 'auto': follow config
      showEn = !!(config.showEnglish && cue.textEn);
      showZh = !!(config.showChinese && cue.textZh);
      showText = !showEn && !showZh;
    }
  }

  return (
    <div className="lp-audio-visual">
      {/* File name — pinned to top */}
      <h2 className="lp-audio-title">{source.displayName?.trim() || 'Audio'}</h2>

      {/* Center area: current subtitle */}
      <div className="lp-audio-center">
        {/* Current subtitle — same logic as SubtitleOverlay */}
        <div className="lp-audio-subtitle-area">
          {showText && (
            <div className="lp-audio-sub-en"><ClickableText text={cue!.text} sentenceEn={cue!.text} sentenceZh={cue!.textZh} cueStart={cue!.start} /></div>
          )}
          {showEn && (
            <div className="lp-audio-sub-en"><ClickableText text={cue!.textEn!} sentenceEn={cue!.textEn} sentenceZh={cue!.textZh} cueStart={cue!.start} /></div>
          )}
          {showZh && (
            <div className="lp-audio-sub-zh"><ClickableText text={cue!.textZh!} sentenceEn={cue!.textEn ?? cue!.text} sentenceZh={cue!.textZh} cueStart={cue!.start} /></div>
          )}
          {!cue && <div className="lp-audio-sub-placeholder">—</div>}
        </div>
      </div>
    </div>
  );
}
