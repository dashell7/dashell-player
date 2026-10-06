export { usePlaybackStore } from './playbackStore';
export { useSubtitleStore, selectCurrentSubtitle } from './subtitleStore';
export { useLoopStore, selectIsABRepeating } from './loopStore';
export { useRecordingStore } from './recordingStore';
export { useUIStore } from './uiStore';
export { useDictationStore } from './dictationStore';

import { usePlaybackStore } from './playbackStore';
import { useSubtitleStore } from './subtitleStore';
import { useLoopStore } from './loopStore';
import { useRecordingStore } from './recordingStore';
import { useUIStore } from './uiStore';
import { useDictationStore } from './dictationStore';

/**
 * Reset the media-bound stores. Use when switching media within a live view —
 * does NOT touch UI prefs (overlay mode) or dictation session state.
 */
export function resetMediaStores(session?: string): void {
  for (const store of [usePlaybackStore, useSubtitleStore, useLoopStore, useRecordingStore]) {
    (session ? store.forSession(session) : store).getState().reset();
  }
}

/** Reset every LangPlayer store. Use on plugin unload. */
export function resetAllStores(): void {
  resetMediaStores();
  useUIStore.getState().reset();
  useDictationStore.getState().reset();
}
