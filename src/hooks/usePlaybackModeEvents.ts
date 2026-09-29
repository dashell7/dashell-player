import { useEffect } from 'react';
import { usePlaybackMode } from './usePlaybackMode';
import { onLpEvent } from '../constants/events';

/**
 * Wire the window-level loop / AB-repeat commands (dispatched by the plugin's
 * keyboard commands in main.ts) to the playback-mode actions.
 *
 * Used by BOTH VideoLayout and AudioLayout so that the "toggle loop" and
 * "AB repeat" commands work regardless of media type. (Previously only
 * VideoLayout listened, so the commands silently did nothing for audio.)
 */
export function usePlaybackModeEvents(): void {
  const { startSegmentLoop, startABRepeat } = usePlaybackMode();

  useEffect(() => {
    const offLoop = onLpEvent('lp-start-segment-loop', ({ cue, count }) => {
      startSegmentLoop(cue, count);
    });
    const offAB = onLpEvent('lp-start-ab-repeat', ({ a, b }) => {
      startABRepeat(a, b);
    });
    return () => {
      offLoop();
      offAB();
    };
  }, [startSegmentLoop, startABRepeat]);
}
