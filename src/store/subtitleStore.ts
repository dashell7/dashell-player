import { create } from './mediaSession';
import type { SubtitleCue, SubtitleConfig } from '../types';
import { DEFAULT_SUBTITLE_CONFIG } from '../types';

interface SubtitleState {
  // State
  subtitles: SubtitleCue[];
  activeIndex: number;
  /** Playhead-follow index from media time sync (always tracks timeline). */
  playheadIndex: number;
  activeWordIndex: number;
  config: SubtitleConfig;
  /** The active practice view owns the active cue while it is open. */
  practiceMode: 'none' | 'dictation';

  // Actions
  setSubtitles: (subtitles: SubtitleCue[]) => void;
  setActiveIndex: (index: number) => void;
  setPlayheadIndex: (index: number) => void;
  setActiveWordIndex: (index: number) => void;
  updateConfig: (patch: Partial<SubtitleConfig>) => void;
  setPracticeMode: (mode: 'none' | 'dictation') => void;
  clearPracticeMode: (mode: 'dictation') => void;
  reset: () => void;
}

const initialState = {
  subtitles: [] as SubtitleCue[],
  activeIndex: -1,
  playheadIndex: -1,
  activeWordIndex: -1,
  config: DEFAULT_SUBTITLE_CONFIG,
  practiceMode: 'none' as const,
};

export const useSubtitleStore = create<SubtitleState>((set) => ({
  ...initialState,

  setSubtitles: (subtitles) => set({ subtitles, activeIndex: -1, playheadIndex: -1, activeWordIndex: -1 }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  setPlayheadIndex: (playheadIndex) => set({ playheadIndex }),
  setActiveWordIndex: (activeWordIndex) => set({ activeWordIndex }),
  updateConfig: (patch) =>
    set((s) => ({ config: { ...s.config, ...patch } })),
  setPracticeMode: (practiceMode) => set({ practiceMode }),
  clearPracticeMode: (mode) => set((s) => s.practiceMode === mode ? { practiceMode: 'none' } : s),
  reset: () =>
    set((s) => ({
      ...initialState,
      // Keep the practice lock across media/source resets while a practice view is open.
      practiceMode: s.practiceMode,
    })),
}));

// ─── Selectors ──────────────────────────────────────────────────────────────

export const selectCurrentSubtitle = (s: SubtitleState): SubtitleCue | null =>
  s.activeIndex >= 0 && s.activeIndex < s.subtitles.length
    ? s.subtitles[s.activeIndex]!
    : null;
