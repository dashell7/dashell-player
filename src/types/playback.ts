// ─── Playback Mode (Discriminated Union) ────────────────────────────────────
//
// Core design: a single `PlaybackMode` value replaces 6+ boolean flags.
// Entering any mode atomically replaces the previous one, making it impossible
// for two modes to be active simultaneously.

export type PlaybackMode =
  | { type: 'normal' }
  | { type: 'segmentPlay'; end: number }
  | {
      type: 'segmentLoop';
      start: number;
      end: number;
      total: number;
      current: number;
      index: number;
    }
  | { type: 'infiniteLoop'; start: number; end: number }
  | { type: 'abRepeat'; pointA: number; pointB: number };

// ─── Mode Constants ─────────────────────────────────────────────────────────

export const NORMAL_MODE: PlaybackMode = { type: 'normal' };

// ─── Playback Rate Steps ────────────────────────────────────────────────────
//
// Shared by the speed menu (SubtitleControls) and the speed-up/down keyboard
// commands (main.ts) so the two can never drift out of sync.
export const SPEED_STEPS: readonly number[] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
