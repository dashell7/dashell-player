import { useStoreApi } from '../store/mediaSession';
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PlayerRef, SubtitleCue } from '../types';
import { usePlaybackStore } from '../store/playbackStore';
import { useSubtitleStore } from '../store/subtitleStore';
import { useLoopStore } from '../store/loopStore';
import { usePlugin } from '../context';

/**
 * RAF-based media sync loop.
 * Key fix: reads all state via getState() every frame — no stale closures.
 * Uses seeking lock to prevent redundant updates during seek operations.
 */
/** Min delta (seconds) before we re-publish currentTime to the playback store.
 *  Avoids 60×/sec re-renders of every component subscribed to currentTime
 *  (progress bar / time display). Progress bar at typical width: 0.1s ≈ 1px. */
const CURRENT_TIME_PUBLISH_DELTA_S = 0.1;

export function useMediaSync(playerRef: RefObject<PlayerRef | null>) {
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const useLoopStoreApi = useStoreApi(useLoopStore);
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const plugin = usePlugin();
  const rafRef = useRef<number>(0);
  const seekingLockRef = useRef(false);
  const seekLockTimeoutRef = useRef<number | null>(null);
  const lastPublishedTimeRef = useRef<number>(-1);
  const lastFrameTimeRef = useRef<number>(-1);
  const lastInputsRef = useRef<unknown[]>([]);

  const syncLoop = useCallback(() => {
    const player = playerRef.current;
    if (!player || seekingLockRef.current) {
      rafRef.current = window.requestAnimationFrame(syncLoop);
      return;
    }

    const currentTime = player.getCurrentTime();

    // Skip the whole sync body when the clock hasn't moved (paused & not
    // seeking). Avoids running getState + binary search + mode logic 60×/sec on
    // a paused player, while still reacting instantly to a seek-while-paused
    // (which changes currentTime and falls through below).
    const subState = useSubtitleStoreApi.getState();
    const loopState = useLoopStoreApi.getState();
    const inputs = [subState.subtitles, subState.practiceMode, subState.activeIndex, loopState.mode, player];
    if (currentTime === lastFrameTimeRef.current && inputs.every((value, i) => value === lastInputsRef.current[i])) {
      rafRef.current = window.requestAnimationFrame(syncLoop);
      return;
    }
    lastFrameTimeRef.current = currentTime;
    lastInputsRef.current = inputs;

    const { subtitles, activeIndex, playheadIndex, practiceMode } = useSubtitleStoreApi.getState();
    const { mode } = useLoopStoreApi.getState();

    // Throttle currentTime publishes to ≥0.1s delta — see CURRENT_TIME_PUBLISH_DELTA_S.
    if (Math.abs(currentTime - lastPublishedTimeRef.current) >= CURRENT_TIME_PUBLISH_DELTA_S) {
      lastPublishedTimeRef.current = currentTime;
      usePlaybackStoreApi.getState().setCurrentTime(currentTime);
      const { source, duration, playing } = usePlaybackStoreApi.getState();
      if (playing && source?.url && duration > 0) {
        plugin.setPlaybackProgress(source.url, currentTime, duration);
      }
    }

    // Find active subtitle at current time.
    // Always update playheadIndex for UI follow (subtitle panel, timeline context),
    // while activeIndex can remain locked by an active practice view.
    const newIndex = findIndexAtTime(subtitles, currentTime);
    if (newIndex !== playheadIndex) {
      useSubtitleStoreApi.getState().setPlayheadIndex(newIndex);
    }
    if (practiceMode === 'none' && newIndex !== activeIndex) {
      useSubtitleStoreApi.getState().setActiveIndex(newIndex);
    }

    // Helper: set seeking lock with tracked timeout
    const setSeekLock = () => {
      seekingLockRef.current = true;
      if (seekLockTimeoutRef.current) window.clearTimeout(seekLockTimeoutRef.current);
      seekLockTimeoutRef.current = window.setTimeout(() => {
        seekingLockRef.current = false;
        seekLockTimeoutRef.current = null;
      }, 100);
    };

    // Handle playback modes
    switch (mode.type) {
      case 'segmentPlay':
        if (currentTime >= mode.end) {
          player.pauseVideo();
          useLoopStoreApi.getState().exitMode();
        }
        break;

      case 'segmentLoop':
        if (currentTime >= mode.end) {
          const { current, total, index } = mode;
          if (current + 1 < total) {
            // Still have loops remaining — seek back to start of this segment
            useLoopStoreApi.getState().incrementLoopCount();
            setSeekLock();
            player.seekTo(mode.start, 'seconds');
          } else {
            // Finished looping this segment — advance to the next subtitle
            const nextIdx = index + 1;
            const nextCue = subtitles[nextIdx];
            if (nextCue && plugin.settings.autoPlayNext && practiceMode === 'none') {
              useLoopStoreApi.getState().enterMode({
                type: 'segmentLoop',
                start: nextCue.start,
                end: nextCue.end,
                total,
                current: 0,
                index: nextIdx,
              });
              setSeekLock();
              player.seekTo(nextCue.start, 'seconds');
            } else {
              // No more subtitles — exit loop mode
              useLoopStoreApi.getState().exitMode();
              player.pauseVideo();
            }
          }
        }
        break;

      case 'infiniteLoop':
        if (currentTime >= mode.end) {
          setSeekLock();
          player.seekTo(mode.start, 'seconds');
        }
        break;

      case 'abRepeat':
        if (currentTime >= mode.pointB) {
          setSeekLock();
          player.seekTo(mode.pointA, 'seconds');
        }
        break;
    }

    rafRef.current = window.requestAnimationFrame(syncLoop);
  }, [playerRef, plugin]);

  useEffect(() => {
    rafRef.current = window.requestAnimationFrame(syncLoop);
    return () => {
      window.cancelAnimationFrame(rafRef.current);
      // Clean up seeking lock timeout on unmount
      if (seekLockTimeoutRef.current) {
        window.clearTimeout(seekLockTimeoutRef.current);
        seekLockTimeoutRef.current = null;
      }
      seekingLockRef.current = false;
    };
  }, [syncLoop]);

  return { seekingLockRef };
}

// ─── Binary search for subtitle at time ─────────────────────────────────────

// Exported for unit testing. Assumes cues are sorted by start (SubtitleParser
// guarantees this) and non-overlapping; returns -1 when `time` falls in a gap.
export function findIndexAtTime(cues: SubtitleCue[], time: number): number {
  if (cues.length === 0) return -1;

  let lo = 0;
  let hi = cues.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const cue = cues[mid]!;
    if (time < cue.start) {
      hi = mid - 1;
    } else if (time > cue.end) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}
