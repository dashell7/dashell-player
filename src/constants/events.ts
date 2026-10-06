import type { SubtitleCue } from '../types';
import { useCallback } from 'react';
import { getActiveMediaSession, useMediaSessionId } from '../store/mediaSession';

// ─── LangPlayer window events ─────────────────────────────────────────────────
// Centralized, typed registry for the window-level CustomEvents used to bridge
// Obsidian commands (registered on the Plugin in main.ts, outside React) with
// the React views that own the player / recorder instances.
//
// Why window events: commands live on the Plugin singleton, but the player &
// recorder live inside React component trees per-leaf. These events are the
// command→view channel. Keeping names + payload types in one place gives
// compile-time safety (no stringly-typed dispatch/listen drift).

export interface LpEventMap {
  /** Start an N-times segment loop of the given cue. */
  'lp-start-segment-loop': { cue: SubtitleCue; count: number };
  /** Start an A/B repeat between two media timestamps. */
  'lp-start-ab-repeat': { a: number; b: number };
  /** Toggle the microphone recorder on the active player. */
  'langplayer-toggle-recording': undefined;
  /** Toggle play/pause of the most recent self-recording. */
  'langplayer-toggle-recording-playback': undefined;
  /** Stop playback of the most recent self-recording. */
  'langplayer-stop-recording-playback': undefined;
  'lp-practice-navigate': { direction: 'next' | 'previous' | 'replay' };
}

export type LpEventName = keyof LpEventMap;

type DispatchArgs<K extends LpEventName> =
  LpEventMap[K] extends undefined ? [] : [detail: LpEventMap[K]];

/** Dispatch a typed LangPlayer window event. */
export function dispatchLpEvent<K extends LpEventName>(
  name: K,
  ...args: DispatchArgs<K>
): void {
  const detail = args[0];
  window.dispatchEvent(new CustomEvent(name, detail === undefined ? undefined : { detail }));
}

/**
 * Subscribe to a typed LangPlayer window event.
 * @returns an unsubscribe function (call from an effect cleanup).
 */
export function onLpEvent<K extends LpEventName>(
  name: K,
  handler: (detail: LpEventMap[K]) => void,
  sessionId?: string,
): () => void {
  const listener = (e: Event) => {
    if (sessionId && sessionId !== getActiveMediaSession()) return;
    handler((e as CustomEvent<LpEventMap[K]>).detail);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
export function useLpEventListener(): typeof onLpEvent {
  const session = useMediaSessionId();
  return useCallback((name, handler) => onLpEvent(name, handler, session), [session]);
}
