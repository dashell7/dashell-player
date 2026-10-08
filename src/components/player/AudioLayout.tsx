import { useMediaSessionId, useStoreApi } from '../../store/mediaSession';
import React, { useRef, useEffect } from 'react';
import { Platform } from 'obsidian';
import type { PlayerRef, MediaSource } from '../../types';
import { MediaPlaybackStatus, MediaPlayer } from './MediaPlayer';
import { notifyPlaybackBarActivity } from '../subtitle/PlaybackBar';
import { useMediaSync } from '../../hooks/useMediaSync';
import { usePlaybackModeEvents } from '../../hooks/usePlaybackModeEvents';
import { usePlayerReady } from '../../hooks/usePlayerReady';
import { usePlaybackStore } from '../../store/playbackStore';

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
      if (!isMouseOver.current || e.defaultPrevented) return;
      if ((document.activeElement as HTMLElement | null)?.closest('button, summary, [role=button], [contenteditable=true]')) return;
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

    </div>
  );
}

function AudioVisualArea({ source }: { source: MediaSource }) {
  return <div className="lp-audio-visual">
    <div className="lp-audio-emblem" aria-hidden="true"><span /><span /><span /><span /><span /></div>
    <div><span className="lp-eyebrow">AUDIO</span><h2 className="lp-audio-title">{source.displayName?.trim() || 'Audio'}</h2></div>
  </div>;
}
