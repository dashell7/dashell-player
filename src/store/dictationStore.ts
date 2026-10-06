import { create } from './mediaSession';

/** Lifecycle phase for the currently focused cue. */
export type DictationPhase =
  | 'idle'              // no cue, or before first playback
  | 'playing'           // audio is playing the current cue
  | 'awaitInput'        // audio paused, user is typing
  | 'incorrectLocked'   // user unlocked the answer; Enter now advances
  | 'correct'           // all boxes correct; advance is queued
  | 'done';             // end-of-session or wrong queue exhausted

export interface DictationReplayPlan {
  cueId: string;
  start: number;
  end: number;
}

interface DictationState {
  // ── View lifecycle ──
  dictationOpen: boolean;

  // ── Per-cue draft (resets on cue change or resetDictationDraft) ──
  /** Per-character input, length = total boxes in current target. '' = empty. */
  boxInputs: string[];
  /** Index of the box where typing will land next. */
  cursor: number;
  /** Box indices that were filled by the "hint" feature (?). Rendered distinctly. */
  hintedBoxes: Record<number, boolean>;
  phase: DictationPhase;

  // ── Per-cue cumulative wrong-keystroke count, keyed by cue.id ──
  failCount: Record<string, number>;

  // ── Active replay plan ──
  dictationReplayPlan: DictationReplayPlan | null;

  // ── Session toggles ──
  dictationRetryWrongOnly: boolean;

  // ── Cross-sentence tracking (kept across cue changes; cleaned on new file) ──
  dictationCheckedCueIds: string[];
  dictationWrongCueIds: string[];

  // ── Actions ──
  setDictationOpen: (open: boolean) => void;
  setPhase: (phase: DictationPhase) => void;
  setReplayPlan: (plan: DictationReplayPlan | null) => void;
  setRetryWrongOnly: (v: boolean) => void;

  /** Initialise an empty box array of the given length and reset cursor + hints. */
  initBoxes: (length: number) => void;
  /** Write a char into the current cursor position (or at given index). */
  writeBoxChar: (char: string, index?: number) => void;
  /** Clear a single box (defaults to cursor-1). Used by backspace. */
  clearBoxChar: (index?: number) => void;
  /** Move the cursor explicitly. */
  setCursor: (cursor: number) => void;
  /** Fill a single box at `index` with `char`, mark it hinted (if not already correct),
   *  and advance cursor by 1. Used by the per-letter hint feature. */
  revealLetter: (index: number, char: string) => void;

  /** Increment wrong-keystroke counter for a cue. */
  incFailCount: (cueId: string) => void;
  /** Drop failCount for one cue. Called on cue change. */
  clearFailCount: (cueId: string) => void;

  markCorrect: (cueId: string) => void;
  markWrongCue: (cueId: string) => void;
  revealAnswer: (cueId: string) => void;

  /** Filter wrong/checked ids and failCount when subtitles change. */
  filterCueIds: (validIds: Set<string>) => void;
  /** Restore cross-cue progress from persisted snapshot. */
  hydrateProgress: (payload: {
    checkedCueIds: string[];
    wrongCueIds: string[];
    failCount?: Record<string, number>;
  }) => void;

  /** Clears per-cue draft only. Preserves: retryWrongOnly, checked/wrong cue ids, failCount. */
  resetDictationDraft: () => void;

  /** Full reset including cross-sentence tracking. */
  reset: () => void;
}

// Note: boxInputs and cursor are NOT included in draftInitial — they're managed
// by the panel's initBoxes effect, which runs on every cue change. Including
// them here would cause a race: resetDictationDraft runs AFTER initBoxes during
// external navigation, wiping the freshly-initialised array back to [].
const draftInitial = {
  phase: 'idle' as DictationPhase,
  dictationReplayPlan: null as DictationReplayPlan | null,
};

const initialState = {
  dictationOpen: false,
  boxInputs: [] as string[],
  cursor: 0,
  hintedBoxes: {} as Record<number, boolean>,
  ...draftInitial,
  failCount: {} as Record<string, number>,
  dictationRetryWrongOnly: false,
  dictationCheckedCueIds: [] as string[],
  dictationWrongCueIds: [] as string[],
};

export const useDictationStore = create<DictationState>((set) => ({
  ...initialState,

  setDictationOpen: (dictationOpen) => set({ dictationOpen }),
  setPhase: (phase) => set({ phase }),
  setReplayPlan: (dictationReplayPlan) => set({ dictationReplayPlan }),
  setRetryWrongOnly: (dictationRetryWrongOnly) => set({ dictationRetryWrongOnly }),

  initBoxes: (length) =>
    set({ boxInputs: Array.from({ length }, () => ''), cursor: 0, hintedBoxes: {} }),

  writeBoxChar: (char, index) =>
    set((s) => {
      const idx = index ?? s.cursor;
      if (idx < 0 || idx >= s.boxInputs.length) return s;
      const next = s.boxInputs.slice();
      next[idx] = char;
      const nextCursor = Math.min(s.boxInputs.length, idx + 1);
      return { boxInputs: next, cursor: nextCursor };
    }),

  clearBoxChar: (index) =>
    set((s) => {
      let idx = index;
      if (idx === undefined) {
        // Backspace: prefer current box if non-empty, else previous
        if (s.cursor < s.boxInputs.length && s.boxInputs[s.cursor] !== '') {
          idx = s.cursor;
        } else {
          idx = Math.max(0, s.cursor - 1);
        }
      }
      if (idx < 0 || idx >= s.boxInputs.length) return s;
      const next = s.boxInputs.slice();
      next[idx] = '';
      return { boxInputs: next, cursor: idx };
    }),

  setCursor: (cursor) =>
    set((s) => ({ cursor: Math.max(0, Math.min(s.boxInputs.length, cursor)) })),

  revealLetter: (index, char) =>
    set((s) => {
      if (index < 0 || index >= s.boxInputs.length) return s;
      const nextBoxes  = s.boxInputs.slice();
      const nextHinted = { ...s.hintedBoxes };
      // Only mark hinted if the user hadn't already typed the correct char there.
      if (nextBoxes[index] !== char) {
        nextHinted[index] = true;
      }
      nextBoxes[index] = char;
      return {
        boxInputs: nextBoxes,
        hintedBoxes: nextHinted,
        cursor: Math.min(nextBoxes.length, index + 1),
      };
    }),

  incFailCount: (cueId) =>
    set((s) => ({ failCount: { ...s.failCount, [cueId]: (s.failCount[cueId] ?? 0) + 1 } })),

  clearFailCount: (cueId) =>
    set((s) => {
      if (!(cueId in s.failCount)) return s;
      const { [cueId]: _drop, ...rest } = s.failCount;
      return { failCount: rest };
    }),

  markCorrect: (cueId) =>
    set((s) => {
      const { [cueId]: _drop, ...restFail } = s.failCount;
      return {
        failCount: restFail,
        dictationCheckedCueIds: s.dictationCheckedCueIds.includes(cueId)
          ? s.dictationCheckedCueIds
          : [...s.dictationCheckedCueIds, cueId],
        dictationWrongCueIds: s.dictationWrongCueIds.filter((id) => id !== cueId),
        phase: 'correct',
      };
    }),

  markWrongCue: (cueId) =>
    set((s) => ({
      dictationWrongCueIds: s.dictationWrongCueIds.includes(cueId)
        ? s.dictationWrongCueIds
        : [...s.dictationWrongCueIds, cueId],
    })),

  revealAnswer: (cueId) =>
    set((s) => ({
      dictationCheckedCueIds: s.dictationCheckedCueIds.includes(cueId)
        ? s.dictationCheckedCueIds
        : [...s.dictationCheckedCueIds, cueId],
      dictationWrongCueIds: s.dictationWrongCueIds.includes(cueId)
        ? s.dictationWrongCueIds
        : [...s.dictationWrongCueIds, cueId],
      phase: 'incorrectLocked',
    })),

  filterCueIds: (validIds) =>
    set((s) => {
      const nextFail: Record<string, number> = {};
      for (const [id, n] of Object.entries(s.failCount)) {
        if (validIds.has(id)) nextFail[id] = n;
      }
      return {
        dictationCheckedCueIds: s.dictationCheckedCueIds.filter((id) => validIds.has(id)),
        dictationWrongCueIds: s.dictationWrongCueIds.filter((id) => validIds.has(id)),
        failCount: nextFail,
      };
    }),

  hydrateProgress: (payload) =>
    set(() => {
      const checked = Array.from(new Set(payload.checkedCueIds));
      const wrong = Array.from(new Set(payload.wrongCueIds));
      const nextFail: Record<string, number> = {};
      if (payload.failCount) {
        for (const [id, n] of Object.entries(payload.failCount)) {
          if (typeof n === 'number' && n > 0) nextFail[id] = Math.floor(n);
        }
      }
      return {
        ...draftInitial,
        dictationRetryWrongOnly: false,
        dictationCheckedCueIds: checked,
        dictationWrongCueIds: wrong,
        failCount: nextFail,
      };
    }),

  resetDictationDraft: () => set(draftInitial),
  reset: () => set(initialState),
}));
