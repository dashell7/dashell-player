import { type Modifier, type Plugin } from 'obsidian';
import type { LangPlayerSettings } from '../types';
import { SPEED_STEPS } from '../types';
import { usePlaybackStore } from '../store/playbackStore';
import { useSubtitleStore } from '../store/subtitleStore';
import { useLoopStore, selectIsABRepeating } from '../store/loopStore';
import { useUIStore } from '../store/uiStore';
import { useRecordingStore } from '../store/recordingStore';
import { dispatchLpEvent } from '../constants/events';
import { speakText } from '../utils';
import { t } from '../i18n';

/** Minimal surface of the plugin the player commands need. */
interface PlayerCommandHost {
  addCommand: Plugin['addCommand'];
  settings: LangPlayerSettings;
}

/** The player has a source loaded (a player ref is published). */
const isPlayerActive = (): boolean => usePlaybackStore.getState().playerRef !== null;

/**
 * Register all player hotkey commands. Extracted from main.ts — these are
 * self-contained (they talk to the Zustand stores and window events, not the
 * plugin's view methods), gated on an active player via checkCallback.
 */
export function registerPlayerCommands(plugin: PlayerCommandHost): void {
  const playerCmd = (
    id: string,
    name: string,
    fn: () => void,
    hotkeys?: { modifiers: Modifier[]; key: string }[],
  ) => {
    plugin.addCommand({
      id,
      name,
      ...(hotkeys ? { hotkeys } : {}),
      checkCallback: (checking) => {
        if (!isPlayerActive()) return false;
        if (!checking) fn();
        return true;
      },
    });
  };

  playerCmd('player-play-pause', t('cmd.playPause'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    usePlaybackStore.getState().playing ? p.pauseVideo() : p.playVideo();
  });

  playerCmd('player-prev-subtitle', t('cmd.prevSub'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const { subtitles, activeIndex, offset } = useSubtitleStore.getState();
    const sub = subtitles[Math.max(0, activeIndex - 1)];
    if (sub) p.seekTo(sub.start + offset, 'seconds');
  });

  playerCmd('player-next-subtitle', t('cmd.nextSub'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const { subtitles, activeIndex, offset } = useSubtitleStore.getState();
    const sub = subtitles[Math.min(subtitles.length - 1, activeIndex + 1)];
    if (sub) p.seekTo(sub.start + offset, 'seconds');
  });

  playerCmd('player-rewind', t('cmd.rewind'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const cur = usePlaybackStore.getState().currentTime;
    p.seekTo(Math.max(0, cur - 5), 'seconds');
  });

  playerCmd('player-fast-forward', t('cmd.fastForward'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const cur = usePlaybackStore.getState().currentTime;
    const dur = usePlaybackStore.getState().duration;
    p.seekTo(Math.min(dur, cur + 5), 'seconds');
  });

  playerCmd('player-replay-current', t('cmd.replayCurrent'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const st = useSubtitleStore.getState();
    const cue = st.subtitles[st.activeIndex];
    if (cue) p.seekTo(cue.start + st.offset, 'seconds');
  });

  playerCmd('player-volume-up', t('cmd.volumeUp'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const vol = Math.min(1, usePlaybackStore.getState().volume + 0.1);
    usePlaybackStore.getState().setVolume(vol);
    p.setVolume(vol);
  });

  playerCmd('player-volume-down', t('cmd.volumeDown'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const vol = Math.max(0, usePlaybackStore.getState().volume - 0.1);
    usePlaybackStore.getState().setVolume(vol);
    p.setVolume(vol);
  });

  playerCmd('player-mute', t('cmd.mute'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const vol = usePlaybackStore.getState().volume;
    const newVol = vol > 0 ? 0 : 1;
    usePlaybackStore.getState().setVolume(newVol);
    p.setVolume(newVol);
  });

  playerCmd('player-speed-down', t('cmd.speedDown'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const rate = usePlaybackStore.getState().playbackRate;
    const idx = SPEED_STEPS.indexOf(rate);
    const next = SPEED_STEPS[Math.max(0, idx - 1)] ?? SPEED_STEPS[0]!;
    usePlaybackStore.getState().setPlaybackRate(next);
    p.setPlaybackRate(next);
  });

  playerCmd('player-speed-up', t('cmd.speedUp'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    const rate = usePlaybackStore.getState().playbackRate;
    const idx = SPEED_STEPS.indexOf(rate);
    const next = SPEED_STEPS[Math.min(SPEED_STEPS.length - 1, idx + 1)] ?? SPEED_STEPS[SPEED_STEPS.length - 1]!;
    usePlaybackStore.getState().setPlaybackRate(next);
    p.setPlaybackRate(next);
  });

  playerCmd('player-speed-reset', t('cmd.speedReset'), () => {
    const p = usePlaybackStore.getState().playerRef;
    if (!p) return;
    usePlaybackStore.getState().setPlaybackRate(1.0);
    p.setPlaybackRate(1.0);
  });

  playerCmd('player-toggle-subtitle', t('cmd.toggleSubtitle'), () => {
    useUIStore.getState().cycleOverlayMode();
  });

  playerCmd('player-toggle-loop', t('cmd.toggleLoop'), () => {
    const mode = useLoopStore.getState().mode;
    const looping = mode.type === 'segmentLoop' || mode.type === 'infiniteLoop';
    if (looping) {
      useLoopStore.getState().exitMode();
    } else {
      const st = useSubtitleStore.getState();
      const cue = st.subtitles[st.activeIndex];
      if (cue) {
        dispatchLpEvent('lp-start-segment-loop', { cue, count: plugin.settings.loopCount });
      }
    }
  });

  playerCmd('player-ab-repeat', t('cmd.abRepeat'), () => {
    const loopState = useLoopStore.getState();
    const isAB = selectIsABRepeating(loopState);
    if (isAB) {
      loopState.clearPoints();
      loopState.exitMode();
    } else if (loopState.pointA !== null) {
      const offset = useSubtitleStore.getState().offset;
      const cur = usePlaybackStore.getState().currentTime - offset;
      dispatchLpEvent('lp-start-ab-repeat', { a: loopState.pointA, b: cur });
    } else {
      const offset = useSubtitleStore.getState().offset;
      const cur = usePlaybackStore.getState().currentTime - offset;
      useLoopStore.getState().setPointA(cur);
    }
  });

  // Element fullscreen is unavailable on iOS WKWebView — skip the command there
  // so the palette doesn't offer a dead action.
  if (typeof document !== 'undefined' && document.fullscreenEnabled) {
    playerCmd('player-fullscreen', t('cmd.fullscreen'), () => {
      const card = document.querySelector('.lp-player-card');
      if (!card) return;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        card.requestFullscreen().catch(() => {});
      }
    });
  }

  // Speak the active subtitle line with the device's TTS voice in the study
  // language — lets learners replay pronunciation without scrubbing the media.
  playerCmd('player-speak-subtitle', t('cmd.speakSubtitle'), () => {
    const st = useSubtitleStore.getState();
    const cue = st.subtitles[st.activeIndex];
    if (!cue) return;
    const p = usePlaybackStore.getState().playerRef;
    p?.pauseVideo();
    speakText(cue.textEn ?? cue.text, plugin.settings.targetLanguage);
  });

  // Recording controls — dispatched as window events so the host LangPlayerView
  // (which owns the recorder instance) can react.
  playerCmd('player-toggle-recording', t('cmd.toggleRecording'), () => {
    dispatchLpEvent('langplayer-toggle-recording');
  });

  // Playback of the most recent recording. Gate on lastRecording so the command
  // palette accurately reflects availability.
  plugin.addCommand({
    id: 'player-toggle-recording-playback',
    name: t('cmd.toggleRecordingPlayback'),
    checkCallback: (checking) => {
      if (useRecordingStore.getState().lastRecording === null) return false;
      if (!checking) dispatchLpEvent('langplayer-toggle-recording-playback');
      return true;
    },
  });
}
