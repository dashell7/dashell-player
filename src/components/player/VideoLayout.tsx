import React, { useRef, useEffect, useCallback } from 'react';
import { Platform } from 'obsidian';
import type { PlayerRef, MediaSource } from '../../types';
import { MediaPlayer } from './MediaPlayer';
import { SubtitleOverlay } from '../subtitle/SubtitleOverlay';
import { SubtitleControls } from '../subtitle/SubtitleControls';
import { useMediaSync } from '../../hooks/useMediaSync';
import { usePlaybackStore } from '../../store/playbackStore';
import { useUIStore } from '../../store/uiStore';
import { usePlaybackModeEvents } from '../../hooks/usePlaybackModeEvents';
import { usePlayerReady } from '../../hooks/usePlayerReady';

interface VideoLayoutProps {
  source: MediaSource;
}

export function VideoLayout({ source }: VideoLayoutProps) {
  const playerRef = useRef<PlayerRef>(null);
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const overlayMode = useUIStore((s) => s.overlayMode);

  // Video fills container width; aspect ratio maintained by the <video> element itself.

  useMediaSync(playerRef);

  // Wire loop / AB-repeat commands (shared with AudioLayout).
  usePlaybackModeEvents();

  const handleReady = usePlayerReady(playerRef, source);

  const togglePlay = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    usePlaybackStore.getState().playing ? p.pauseVideo() : p.playVideo();
  }, []);

  // Hover-based keyboard shortcuts (desktop only): track mouse position, listen at document level.
  // No focus-stealing — Obsidian's own hotkey settings remain fully functional.
  const isMouseOver = useRef(false);
  useEffect(() => {
    if (Platform.isMobile) return;
    const handler = (e: KeyboardEvent) => {
      if (!isMouseOver.current) return;
      // Skip if an input/textarea has focus (user is typing)
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Skip if any Obsidian modal is open (settings, dialogs, etc.)
      if (document.querySelector('.modal-container, .modal-bg')) return;

      const p = playerRef.current;
      if (!p) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        usePlaybackStore.getState().playing ? p.pauseVideo() : p.playVideo();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        p.seekTo(Math.max(0, p.getCurrentTime() - 5), 'seconds');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        p.seekTo(Math.min(usePlaybackStore.getState().duration, p.getCurrentTime() + 5), 'seconds');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div
      className="lp-player-card"
      ref={videoWrapRef}
      onMouseEnter={() => { isMouseOver.current = true; }}
      onMouseLeave={() => { isMouseOver.current = false; }}
    >
      {/* Full-width column — video fills container, aspect ratio via CSS */}
      <div className="lp-video-column">
        <div className="lp-video-area" onClick={togglePlay}>
          <MediaPlayer
            ref={playerRef}
            source={source}
            mediaType="video"
            onReady={handleReady}
          />
          {overlayMode !== 'off' && (
            <SubtitleOverlay />
          )}
        </div>

        {/* Controls bar — same width as video, Obsidian theme background */}
        <div className="lp-controls-bar">
          <SubtitleControls playerRef={playerRef} />
        </div>
      </div>
    </div>
  );
}
