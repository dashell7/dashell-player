import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'obsidian';
import type { PlaybackBarDisplay, PlaybackBarPosition, PlaybackBarVisibility, PlayerRef } from '../../types';
import { useMediaView } from '../../context';
import { usePlaybackStore } from '../../store/playbackStore';
import { useMediaSessionId } from '../../store/mediaSession';
import { SubtitleControls } from './SubtitleControls';

const SETTINGS_EVENT = 'langplayer-settings-changed';
const ACTIVITY_EVENT = 'langplayer-playback-bar-activity';

export function isPlaybackBarActivityForSession(
  eventSessionId: string | undefined,
  sessionId: string,
): boolean {
  return eventSessionId === sessionId;
}

/** Pure visibility rule shared by the component and unit tests. */
export function shouldShowPlaybackBar(
  visibility: PlaybackBarVisibility,
  playing: boolean,
  isMobile: boolean,
): boolean {
  switch (visibility) {
    case 'always':
      return true;
    case 'always-mobile':
      // This matches Aloud's behaviour: mobile keeps the toolbar available,
      // while desktop shows it when there is active playback.
      return isMobile || playing;
    case 'playing':
      return playing;
    case 'never':
      return false;
    default:
      return true;
  }
}

interface PlaybackBarProps {
  playerRef: React.RefObject<PlayerRef | null>;
}

/**
 * Aloud-style toolbar shell. The controls themselves remain LangPlayer's
 * learning controls; this component owns when and where the bar is shown so
 * audio and video views have identical behaviour.
 */
export function PlaybackBar({ playerRef }: PlaybackBarProps) {
  const { settings } = useMediaView();
  const sessionId = useMediaSessionId();
  const playing = usePlaybackStore((state) => state.playing);
  const [, setSettingsRevision] = useState(0);
  const [floatingVisible, setFloatingVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Settings are intentionally stored on the plugin object and mutated in
  // place. This event lets an open player react without remounting the view.
  useEffect(() => {
    const onSettingsChanged = () => setSettingsRevision((value) => value + 1);
    window.addEventListener(SETTINGS_EVENT, onSettingsChanged);
    return () => window.removeEventListener(SETTINGS_EVENT, onSettingsChanged);
  }, []);

  const visibility = settings.playbackBarVisibility ?? 'always';
  const display: PlaybackBarDisplay = settings.playbackBarDisplay ?? 'fixed';
  const position: PlaybackBarPosition = settings.playbackBarPosition ?? 'bottom';
  const autoHideMs = Math.max(1000, Math.min(10000, settings.playbackBarAutoHideMs ?? 2500));
  const eligible = shouldShowPlaybackBar(visibility, playing, Platform.isMobile);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    if (!eligible) return;
    setFloatingVisible(true);
    clearHideTimer();
    if (display === 'floating') {
      hideTimer.current = window.setTimeout(() => {
        setFloatingVisible(false);
        hideTimer.current = null;
      }, autoHideMs);
    }
  }, [autoHideMs, clearHideTimer, display, eligible]);

  useEffect(() => {
    clearHideTimer();
    if (!eligible) {
      setFloatingVisible(false);
    } else if (display === 'fixed') {
      setFloatingVisible(true);
    } else {
      setFloatingVisible(true);
      hideTimer.current = window.setTimeout(() => {
        setFloatingVisible(false);
        hideTimer.current = null;
      }, autoHideMs);
    }
    return clearHideTimer;
  }, [autoHideMs, clearHideTimer, display, eligible]);

  // A hidden floating bar cannot receive pointer events. The media area sends
  // this activity event so moving over the player brings it back immediately.
  useEffect(() => {
    const onActivity = (event: Event) => {
      const activity = event as CustomEvent<{ sessionId?: string }>;
      if (!isPlaybackBarActivityForSession(activity.detail?.sessionId, sessionId)) return;
      reveal();
    };
    window.addEventListener(ACTIVITY_EVENT, onActivity);
    return () => window.removeEventListener(ACTIVITY_EVENT, onActivity);
  }, [reveal, sessionId]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  const hidden = !eligible || (display === 'floating' && !floatingVisible);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (hidden) {
      if (bar.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
      bar.setAttribute('inert', '');
    } else {
      bar.removeAttribute('inert');
    }
  }, [hidden]);

  const className = [
    'lp-playback-bar',
    'lp-controls-bar',
    `lp-playback-bar--${display}`,
    `lp-playback-bar--${position}`,
    hidden ? 'is-hidden' : 'is-visible',
  ].join(' ');

  return (
    <div
      ref={barRef}
      className={className}
      role="region"
      aria-label="Playback controls"
      aria-hidden={hidden}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseMove={reveal}
      onFocusCapture={reveal}
      onTouchStart={reveal}
    >
      <SubtitleControls playerRef={playerRef} />
    </div>
  );
}

/** Notify all mounted bars that the user is interacting with the media area. */
export function notifyPlaybackBarActivity(sessionId?: string): void {
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: { sessionId } }));
}

