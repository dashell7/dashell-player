import { useCallback } from 'react';
import type { SubtitleCue } from '../types';
import { useLoopStore } from '../store/loopStore';
import { useSubtitleStore } from '../store/subtitleStore';
import { usePlaybackStore } from '../store/playbackStore';

export function usePlaybackMode() {
  const mode = useLoopStore((s) => s.mode);
  const enterMode = useLoopStore((s) => s.enterMode);
  const exitMode = useLoopStore((s) => s.exitMode);

  const playSegmentOnce = useCallback((cue: SubtitleCue) => {
    const player = usePlaybackStore.getState().playerRef;
    const offset = useSubtitleStore.getState().offset;
    if (!player) return;

    enterMode({ type: 'segmentPlay', end: cue.end });
    player.seekTo(cue.start + offset, 'seconds');
    player.playVideo();
  }, [enterMode]);

  const startSegmentLoop = useCallback((cue: SubtitleCue, total: number) => {
    const player = usePlaybackStore.getState().playerRef;
    const offset = useSubtitleStore.getState().offset;
    if (!player) return;

    enterMode({
      type: 'segmentLoop',
      start: cue.start,
      end: cue.end,
      total,
      current: 0,
      index: cue.index,
    });
    player.seekTo(cue.start + offset, 'seconds');
    player.playVideo();
  }, [enterMode]);

  const startInfiniteLoop = useCallback((cue: SubtitleCue) => {
    const player = usePlaybackStore.getState().playerRef;
    const offset = useSubtitleStore.getState().offset;
    if (!player) return;

    enterMode({ type: 'infiniteLoop', start: cue.start, end: cue.end });
    player.seekTo(cue.start + offset, 'seconds');
    player.playVideo();
  }, [enterMode]);

  const startABRepeat = useCallback((pointA: number, pointB: number) => {
    const player = usePlaybackStore.getState().playerRef;
    const offset = useSubtitleStore.getState().offset;
    if (!player) return;

    enterMode({ type: 'abRepeat', pointA, pointB });
    player.seekTo(pointA + offset, 'seconds');
    player.playVideo();
  }, [enterMode]);

  return {
    mode,
    exitMode,
    playSegmentOnce,
    startSegmentLoop,
    startInfiniteLoop,
    startABRepeat,
  };
}
