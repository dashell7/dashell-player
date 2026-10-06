import { useStoreApi } from '../store/mediaSession';
import { useCallback, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PlayerRef, MediaSource } from '../types';
import { usePlaybackStore } from '../store/playbackStore';
import { usePlugin } from '../context';

/** Defer playVideo() so we don't call play() during the loadedmetadata event. */
const READY_PLAY_DELAY_MS = 100;

/**
 * Shared "player ready" handler for VideoLayout / AudioLayout.
 *
 * - Publishes the player ref to the playback store.
 * - If the source carries an explicit timestamp (deep link / file-menu), seek
 *   there and start playing.
 * - Otherwise, resume the last saved position for this URL if one exists
 *   (without autoplaying — positioning only).
 */
export function usePlayerReady(
  playerRef: RefObject<PlayerRef | null>,
  source: MediaSource,
): () => void {
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const plugin = usePlugin();
  const playTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (playTimerRef.current !== null) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);
  return useCallback(() => {
    const player = playerRef.current;
    usePlaybackStoreApi.getState().setPlayerRef(player);
    if (!player) return;

    if (source.timestamp != null) {
      player.seekTo(source.timestamp);
      if (playTimerRef.current !== null) window.clearTimeout(playTimerRef.current);
      playTimerRef.current = window.setTimeout(() => {
        playTimerRef.current = null;
        playerRef.current?.playVideo();
      }, READY_PLAY_DELAY_MS);
      return;
    }

    const saved = source.url ? plugin.getPlaybackProgress(source.url) : undefined;
    if (saved !== undefined) {
      player.seekTo(saved);
    }
  }, [playerRef, plugin, source]);
}
