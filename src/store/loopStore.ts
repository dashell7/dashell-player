import { create } from './mediaSession';
import type { PlaybackMode } from '../types';
import { NORMAL_MODE } from '../types';

interface LoopState {
  // State
  mode: PlaybackMode;
  pointA: number | null;
  pointB: number | null;

  // Actions
  enterMode: (mode: PlaybackMode) => void;
  exitMode: () => void;
  incrementLoopCount: () => void;
  setPointA: (t: number) => void;
  setPointB: (t: number) => void;
  clearPoints: () => void;
  reset: () => void;
}

const initialState = {
  mode: NORMAL_MODE,
  pointA: null as number | null,
  pointB: null as number | null,
};

export const useLoopStore = create<LoopState>((set) => ({
  ...initialState,

  enterMode: (mode) => set({ mode }),
  exitMode: () => set({ mode: NORMAL_MODE }),

  incrementLoopCount: () =>
    set((s) => {
      if (s.mode.type !== 'segmentLoop') return s;
      return {
        mode: { ...s.mode, current: s.mode.current + 1 },
      };
    }),

  setPointA: (t) => set({ pointA: t }),
  setPointB: (t) => set({ pointB: t }),
  clearPoints: () => set({ pointA: null, pointB: null }),
  reset: () => set(initialState),
}));

// ─── Selectors ──────────────────────────────────────────────────────────────

export const selectIsLooping = (s: LoopState): boolean =>
  s.mode.type === 'segmentLoop' ||
  s.mode.type === 'infiniteLoop' ||
  s.mode.type === 'abRepeat';

export const selectIsABRepeating = (s: LoopState): boolean =>
  s.mode.type === 'abRepeat';
