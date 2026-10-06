import { useStoreApi } from '../../store/mediaSession';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DictationSessionStats, SubtitleCue } from '../../types';
import { DEFAULT_DICTATION_HOTKEYS } from '../../types';
import { useSubtitleStore, selectCurrentSubtitle } from '../../store/subtitleStore';
import { usePlaybackStore } from '../../store/playbackStore';
import { useLoopStore } from '../../store/loopStore';
import { useRecordingStore } from '../../store/recordingStore';
import { useUIStore } from '../../store/uiStore';
import { useDictationStore } from '../../store/dictationStore';
import { usePlugin, useSettings } from '../../context';
import { RecordingPlayback } from '../recording/RecordingPlayback';
import {
  buildDictationMediaKey,
  buildSubtitleFingerprint,
  createDefaultStudyHabitProgress,
  formatHotkeyLabel,
  getStudyHabitSummary,
  getStudyRecoveryStatus,
  isHotkeyMatch,
  normalizeDictationKey,
  normalizeDictationText,
  normalizeDictationDisplay,
} from '../../utils';
import { t } from '../../i18n';
import { dispatchLpEvent, useLpEventListener } from '../../constants/events';

const MONITOR_TICK_MS = 100;
const MONITOR_END_TOLERANCE_S = 0.05;
const PROGRESS_SAVE_DEBOUNCE_MS = 450;
const EMPTY_STATS: DictationSessionStats = {
  replayCount: 0,
  hintCount: 0,
  revealCount: 0,
  wrongKeystrokes: 0,
};

type Token =
  | { kind: 'word'; chars: string[]; startIndex: number }
  | { kind: 'sep'; text: string; isSpace: boolean };

// A "box" character: any Unicode letter/number (so accented letters like é/ü/ñ
// count and aren't split off as separators — previously [a-z0-9'] dropped them,
// making diacritic words impossible to complete), plus apostrophe for don't/I'm.
const WORD_CHAR_RE = /[\p{L}\p{N}']/u;

// `target` is the lower-cased, normalized answer used for matching. `display`
// is the same string with original capitalization preserved (length-aligned);
// when provided, `displayChars` carries the original-case glyph for each box so
// the UI can show real capitalization while matching stays case-insensitive.
function tokenize(
  target: string,
  display?: string,
): { tokens: Token[]; targetChars: string[]; displayChars: string[] } {
  const src = display && display.length === target.length ? display : target;
  const tokens: Token[] = [];
  const targetChars: string[] = [];
  const displayChars: string[] = [];
  let i = 0;
  let cursor = 0;
  while (i < target.length) {
    const ch = target[i]!;
    if (WORD_CHAR_RE.test(ch)) {
      const start = i;
      while (i < target.length && WORD_CHAR_RE.test(target[i]!)) i++;
      const chars = [...target.slice(start, i)];
      const dchars = [...src.slice(start, i)];
      tokens.push({ kind: 'word', chars, startIndex: cursor });
      for (let k = 0; k < chars.length; k++) {
        targetChars.push(chars[k]!);
        displayChars.push(dchars[k] ?? chars[k]!);
      }
      cursor += chars.length;
    } else {
      const start = i;
      while (i < target.length && !WORD_CHAR_RE.test(target[i]!)) i++;
      const text = target.slice(start, i);
      tokens.push({ kind: 'sep', text, isSpace: !/\S/.test(text) });
    }
  }
  return { tokens, targetChars, displayChars };
}

function shouldHideOverlay(mode: string): boolean {
  return mode !== 'off';
}

function safeStats(input: Partial<DictationSessionStats> | undefined): DictationSessionStats {
  return {
    replayCount: Math.max(0, Math.floor(input?.replayCount ?? 0)),
    hintCount: Math.max(0, Math.floor(input?.hintCount ?? 0)),
    revealCount: Math.max(0, Math.floor(input?.revealCount ?? 0)),
    wrongKeystrokes: Math.max(0, Math.floor(input?.wrongKeystrokes ?? 0)),
  };
}

export function DictationPanel() {
  const listenLpEvent = useLpEventListener();
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const useDictationStoreApi = useStoreApi(useDictationStore);
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const useLoopStoreApi = useStoreApi(useLoopStore);
  const useUIStoreApi = useStoreApi(useUIStore);
  const useRecordingStoreApi = useStoreApi(useRecordingStore);
  const plugin = usePlugin();

  const boxInputs = useDictationStore((s) => s.boxInputs);
  const cursor = useDictationStore((s) => s.cursor);
  const hintedBoxes = useDictationStore((s) => s.hintedBoxes);
  const phase = useDictationStore((s) => s.phase);
  const failCount = useDictationStore((s) => s.failCount);
  const dictationRetryWrongOnly = useDictationStore((s) => s.dictationRetryWrongOnly);
  const dictationCheckedCueIds = useDictationStore((s) => s.dictationCheckedCueIds);
  const dictationWrongCueIds = useDictationStore((s) => s.dictationWrongCueIds);

  const cue = useSubtitleStore(selectCurrentSubtitle);
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const activeIndex = useSubtitleStore((s) => s.activeIndex);
  const playerRefState = usePlaybackStore((s) => s.playerRef);
  const playbackSourceUrl = usePlaybackStore((s) => s.source?.url ?? '');

  const recorderState = useRecordingStore((s) => s.recorderState);
  const settings = useSettings();

  const strictness = settings.dictation?.inputStrictness ?? 'relaxed';
  const dictationHotkeys = settings.dictation?.hotkeys ?? DEFAULT_DICTATION_HOTKEYS;
  const hotkeyReplayLabel = formatHotkeyLabel(dictationHotkeys.replay);
  const hotkeyHintLabel = formatHotkeyLabel(dictationHotkeys.hint);
  const hotkeyRevealLabel = formatHotkeyLabel(dictationHotkeys.revealAnswer);

  const cueAnswerRaw = (cue?.textEn?.trim() || cue?.text?.trim() || '');
  const cueAnswer = useMemo(
    () => normalizeDictationText(cueAnswerRaw, strictness),
    [cueAnswerRaw, strictness],
  );
  // Original-case version (length-aligned with cueAnswer) so boxes can render
  // the real capitalization while matching stays case-insensitive.
  const cueDisplay = useMemo(
    () => normalizeDictationDisplay(cueAnswerRaw, strictness),
    [cueAnswerRaw, strictness],
  );

  const isRecordingBusy =
    recorderState === 'preparing' || recorderState === 'recording' || recorderState === 'stopping';
  const unlockAfter = Math.max(1, Math.min(20, settings.dictation?.unlockShowAnswerAfter ?? 5));
  const currentFailCount = cue ? (failCount[cue.id] ?? 0) : 0;
  const canUnlock = phase === 'awaitInput' && currentFailCount >= unlockAfter;
  const isLocked = phase === 'incorrectLocked';

  const { tokens, targetChars, displayChars } = useMemo(
    () => tokenize(cueAnswer, cueDisplay),
    [cueAnswer, cueDisplay],
  );
  const subtitleFingerprint = useMemo(() => buildSubtitleFingerprint(subtitles), [subtitles]);
  const mediaKey = useMemo(
    () => buildDictationMediaKey(playbackSourceUrl, subtitleFingerprint),
    [playbackSourceUrl, subtitleFingerprint],
  );

  const checkedCueIdSet = useMemo(() => new Set(dictationCheckedCueIds), [dictationCheckedCueIds]);
  const wrongCueIdSet = useMemo(() => new Set(dictationWrongCueIds), [dictationWrongCueIds]);
  const subtitleById = useMemo(() => new Map(subtitles.map((s) => [s.id, s])), [subtitles]);

  const [sessionStats, setSessionStats] = useState<DictationSessionStats>(EMPTY_STATS);
  const [failTotalByCue, setFailTotalByCue] = useState<Record<string, number>>({});
  const [habitProgress, setHabitProgress] = useState(
    plugin.settings.studyHabitProgress ?? createDefaultStudyHabitProgress(),
  );
  const sessionStatsRef = useRef<DictationSessionStats>(EMPTY_STATS);
  const failTotalByCueRef = useRef<Record<string, number>>({});
  const restoringProgressRef = useRef(false);
  const progressSaveTimerRef = useRef<number | null>(null);
  const loadedProgressKeyRef = useRef<string | null>(null);

  const replayMonitorRef = useRef<number | null>(null);
  const replayMonitorGenRef = useRef(0);
  const advanceTimerRef = useRef<number | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const panelSetIndexRef = useRef<number | null>(null);
  const dotsContainerRef = useRef<HTMLDivElement>(null);
  const prevActiveIndexRef = useRef(activeIndex);
  const prevCueIdRef = useRef<string | null>(cue?.id ?? null);
  const wrongBoxLatchRef = useRef<Set<number>>(new Set());
  /** Cue id we've already run the "all correct" pause/mark logic for. Prevents
   *  re-firing when the user replays a solved cue (which flips phase back to
   *  'playing' and would otherwise instantly pause the replay again). */
  const correctMarkedCueRef = useRef<string | null>(null);
  const pendingLoopRetargetRef = useRef<
    | { type: 'segmentLoop'; total: number }
    | { type: 'infiniteLoop' }
    | null
  >(null);

  const bumpStat = useCallback((key: keyof DictationSessionStats) => {
    setSessionStats((prev) => {
      const next = { ...prev, [key]: prev[key] + 1 };
      sessionStatsRef.current = next;
      return next;
    });
  }, []);

  const bumpFailTotalForCue = useCallback((cueId: string) => {
    setFailTotalByCue((prev) => {
      const next = { ...prev, [cueId]: (prev[cueId] ?? 0) + 1 };
      failTotalByCueRef.current = next;
      return next;
    });
  }, []);

  const hardSentences = useMemo(() => {
    return Object.entries(failTotalByCue)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cueId, count]) => ({
        cueId,
        count,
        text: subtitleById.get(cueId)?.textEn || subtitleById.get(cueId)?.text || cueId,
      }));
  }, [failTotalByCue, subtitleById]);

  const habitSummary = useMemo(
    () => getStudyHabitSummary(habitProgress, settings.studyHabit),
    [habitProgress, settings.studyHabit],
  );
  const recoveryStatus = useMemo(
    () => getStudyRecoveryStatus(habitProgress, settings.studyHabit),
    [habitProgress, settings.studyHabit],
  );
  const showRecoveryCard = settings.studyHabit.enabled && recoveryStatus.shouldShow;

  const recordStudySentence = useCallback(() => {
    if (!settings.studyHabit.enabled) return;
    void plugin.recordStudyActivity(1)
      .then(setHabitProgress)
      .catch(() => {
        // Habit tracking is supportive, never blocking.
      });
  }, [plugin, settings.studyHabit.enabled]);

  const dictationWrongSubtitles = useMemo(
    () => subtitles.filter((s) => wrongCueIdSet.has(s.id)),
    [subtitles, wrongCueIdSet],
  );

  const dictationTotal = dictationRetryWrongOnly ? dictationWrongSubtitles.length : subtitles.length;

  const dictationCurrent = useMemo(() => {
    if (!cue || dictationTotal <= 0) return 0;
    if (dictationRetryWrongOnly) {
      const idx = dictationWrongSubtitles.findIndex((s) => s.id === cue.id);
      return idx >= 0 ? idx + 1 : 0;
    }
    return activeIndex >= 0 ? activeIndex + 1 : 0;
  }, [cue, dictationTotal, dictationRetryWrongOnly, dictationWrongSubtitles, activeIndex]);

  const allBoxesCorrect = useMemo(() => {
    if (targetChars.length === 0) return false;
    if (boxInputs.length !== targetChars.length) return false;
    for (let i = 0; i < targetChars.length; i++) {
      if (boxInputs[i] !== targetChars[i]) return false;
    }
    return true;
  }, [boxInputs, targetChars]);

  const clearReplayMonitor = useCallback(() => {
    replayMonitorGenRef.current += 1;
    if (replayMonitorRef.current !== null) {
      window.clearInterval(replayMonitorRef.current);
      replayMonitorRef.current = null;
    }
  }, []);

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const clearProgressSaveTimer = useCallback(() => {
    if (progressSaveTimerRef.current !== null) {
      window.clearTimeout(progressSaveTimerRef.current);
      progressSaveTimerRef.current = null;
    }
  }, []);

  const flushProgressSnapshot = useCallback(async () => {
    if (!mediaKey || subtitles.length === 0) return;
    const curCueId = selectCurrentSubtitle(useSubtitleStoreApi.getState())?.id;
    const snapshot = {
      checkedCueIds: [...useDictationStoreApi.getState().dictationCheckedCueIds],
      wrongCueIds: [...useDictationStoreApi.getState().dictationWrongCueIds],
      failTotalByCue: { ...failTotalByCueRef.current },
      stats: { ...sessionStatsRef.current },
      subtitleFingerprint,
      updatedAt: Date.now(),
      ...(curCueId ? { lastCueId: curCueId } : {}),
    };
    try {
      await plugin.setDictationProgress(mediaKey, snapshot);
    } catch {
      // noop: persistence errors should not block practice flow
    }
  }, [mediaKey, plugin, subtitleFingerprint, subtitles.length]);

  const scheduleProgressSave = useCallback(() => {
    if (restoringProgressRef.current) return;
    clearProgressSaveTimer();
    progressSaveTimerRef.current = window.setTimeout(() => {
      progressSaveTimerRef.current = null;
      void flushProgressSnapshot();
    }, PROGRESS_SAVE_DEBOUNCE_MS);
  }, [clearProgressSaveTimer, flushProgressSnapshot]);

  const startReplayMonitor = useCallback((plan: { start: number; end: number }) => {
    clearReplayMonitor();
    const gen = replayMonitorGenRef.current;
    // The player was likely paused AT cue.end before this replay. seekTo(start)
    // is async, so the first monitor ticks may still read the stale end-position
    // and pause instantly — which rejects the just-issued play() ("interrupted
    // by a call to pause()"). Guard: don't allow a pause until we've confirmed
    // the playhead actually dropped below cue.end (seek applied, playing again).
    let seekConfirmed = false;
    const intervalId = window.setInterval(() => {
      if (gen !== replayMonitorGenRef.current) return;
      const player = usePlaybackStoreApi.getState().playerRef;
      if (!player) return;
      const ct = player.getCurrentTime();

      if (!seekConfirmed) {
        if (ct < plan.end - MONITOR_END_TOLERANCE_S) {
          seekConfirmed = true; // seek landed; playback is within the cue now
        }
        return; // never pause before the seek is confirmed
      }

      if (ct < plan.end - MONITOR_END_TOLERANCE_S) return;

      const loopMode = useLoopStoreApi.getState().mode;
      const isLooping = loopMode.type === 'segmentLoop' || loopMode.type === 'infiniteLoop';
      const { phase: curPhase } = useDictationStoreApi.getState();
      if (curPhase === 'playing') useDictationStoreApi.getState().setPhase('awaitInput');
      if (!isLooping) player.pauseVideo();

      if (replayMonitorRef.current === intervalId && gen === replayMonitorGenRef.current) {
        window.clearInterval(intervalId);
        replayMonitorRef.current = null;
        replayMonitorGenRef.current += 1;
      }
    }, MONITOR_TICK_MS);
    replayMonitorRef.current = intervalId;
  }, [clearReplayMonitor]);

  const startDictationPlaybackForCue = useCallback((targetCue: SubtitleCue) => {
    const player = usePlaybackStoreApi.getState().playerRef;
    if (!player) return;
    // Mutual exclusion: starting the original sentence stops any in-progress
    // recording playback so the two audio sources never overlap.
    dispatchLpEvent('langplayer-stop-recording-playback');
    const start = Math.max(0, targetCue.start);
    const end = Math.max(start, targetCue.end);
    useDictationStoreApi.getState().setReplayPlan({ cueId: targetCue.id, start, end });
    useDictationStoreApi.getState().setPhase('playing');

    const loopMode = useLoopStoreApi.getState().mode;
    const pending = pendingLoopRetargetRef.current;
    pendingLoopRetargetRef.current = null;
    if (loopMode.type === 'segmentLoop') {
      useLoopStoreApi.getState().enterMode({
        type: 'segmentLoop',
        start: targetCue.start,
        end: targetCue.end,
        total: loopMode.total,
        current: 0,
        index: targetCue.index,
      });
    } else if (loopMode.type === 'infiniteLoop') {
      useLoopStoreApi.getState().enterMode({
        type: 'infiniteLoop',
        start: targetCue.start,
        end: targetCue.end,
      });
    } else if (pending?.type === 'segmentLoop') {
      useLoopStoreApi.getState().enterMode({
        type: 'segmentLoop',
        start: targetCue.start,
        end: targetCue.end,
        total: pending.total,
        current: 0,
        index: targetCue.index,
      });
    } else if (pending?.type === 'infiniteLoop') {
      useLoopStoreApi.getState().enterMode({
        type: 'infiniteLoop',
        start: targetCue.start,
        end: targetCue.end,
      });
    }

    startReplayMonitor({ start, end });
    player.seekTo(start, 'seconds');
    player.playVideo();
  }, [startReplayMonitor]);

  const resetForCueChange = useCallback(() => {
    clearReplayMonitor();
    clearAdvanceTimer();
    wrongBoxLatchRef.current = new Set();
    useDictationStoreApi.getState().resetDictationDraft();
  }, [clearReplayMonitor, clearAdvanceTimer]);

  const goToNextDictationCue = useCallback(() => {
    const subState = useSubtitleStoreApi.getState();
    const { subtitles: subList, activeIndex: currentActiveIndex } = subState;
    if (subList.length === 0) return;
    const currentCue = selectCurrentSubtitle(subState);
    const currentIdx =
      currentActiveIndex >= 0 && currentActiveIndex < subList.length
        ? currentActiveIndex
        : currentCue
          ? subList.findIndex((s) => s.id === currentCue.id)
          : -1;
    const { dictationRetryWrongOnly: retryWrongOnly } = useDictationStoreApi.getState();
    if (currentCue) useDictationStoreApi.getState().clearFailCount(currentCue.id);
    resetForCueChange();

    if (retryWrongOnly) {
      const wrongSubs = subList.filter((s) => wrongCueIdSet.has(s.id));
      if (wrongSubs.length === 0) {
        useDictationStoreApi.getState().setRetryWrongOnly(false);
        useDictationStoreApi.getState().setPhase('done');
        return;
      }
      const pos = currentCue ? wrongSubs.findIndex((s) => s.id === currentCue.id) : -1;
      const next = pos >= 0 ? wrongSubs[(pos + 1) % wrongSubs.length] : wrongSubs[0];
      if (next) {
        const idx = subList.findIndex((s) => s.id === next.id);
        if (idx >= 0) {
          panelSetIndexRef.current = idx;
          useSubtitleStoreApi.getState().setActiveIndex(idx);
          startDictationPlaybackForCue(next);
        }
      }
      return;
    }

    const nextIdx = Math.max(-1, currentIdx) + 1;
    if (nextIdx >= subList.length) {
      useDictationStoreApi.getState().setPhase('done');
      return;
    }
    const next = subList[nextIdx];
    if (next) {
      panelSetIndexRef.current = nextIdx;
      useSubtitleStoreApi.getState().setActiveIndex(nextIdx);
      startDictationPlaybackForCue(next);
    }
  }, [resetForCueChange, startDictationPlaybackForCue, wrongCueIdSet]);



  // Mirror of goToNextDictationCue, going backward. Revisiting an earlier
  // sentence is navigation only: it does NOT mark the current cue wrong or
  // clear its fail count. Stays put at the first sentence (no wrap to 'done').
  const goToPrevDictationCue = useCallback(() => {
    const subState = useSubtitleStoreApi.getState();
    const { subtitles: subList, activeIndex: currentActiveIndex } = subState;
    if (subList.length === 0) return;
    const currentCue = selectCurrentSubtitle(subState);
    const currentIdx =
      currentActiveIndex >= 0 && currentActiveIndex < subList.length
        ? currentActiveIndex
        : currentCue
          ? subList.findIndex((s) => s.id === currentCue.id)
          : -1;
    const { dictationRetryWrongOnly: retryWrongOnly } = useDictationStoreApi.getState();
    resetForCueChange();

    if (retryWrongOnly) {
      const wrongSubs = subList.filter((s) => wrongCueIdSet.has(s.id));
      if (wrongSubs.length === 0) return;
      const pos = currentCue ? wrongSubs.findIndex((s) => s.id === currentCue.id) : -1;
      const prev = pos >= 0 ? wrongSubs[(pos - 1 + wrongSubs.length) % wrongSubs.length] : wrongSubs[0];
      if (prev) {
        const idx = subList.findIndex((s) => s.id === prev.id);
        if (idx >= 0) {
          panelSetIndexRef.current = idx;
          useSubtitleStoreApi.getState().setActiveIndex(idx);
          startDictationPlaybackForCue(prev);
        }
      }
      return;
    }

    const prevIdx = currentIdx - 1;
    if (prevIdx < 0) return; // already at the first sentence
    const prev = subList[prevIdx];
    if (prev) {
      panelSetIndexRef.current = prevIdx;
      useSubtitleStoreApi.getState().setActiveIndex(prevIdx);
      startDictationPlaybackForCue(prev);
    }
  }, [resetForCueChange, startDictationPlaybackForCue, wrongCueIdSet]);

  useEffect(() => listenLpEvent('lp-practice-navigate', ({direction}) => {
    if (direction === 'next') goToNextDictationCue();
    else if (direction === 'previous') goToPrevDictationCue();
    else {
      const current = selectCurrentSubtitle(useSubtitleStoreApi.getState());
      if (current) startDictationPlaybackForCue(current);
    }
  }), [goToNextDictationCue, goToPrevDictationCue, startDictationPlaybackForCue, listenLpEvent]);

  // Jump straight to a specific cue (clicking a progress dot). Pure navigation —
  // resets the current draft and starts that cue, without marking anything wrong.
  const jumpToDictationCue = useCallback((targetCue: SubtitleCue) => {
    const subList = useSubtitleStoreApi.getState().subtitles;
    const idx = subList.findIndex((s) => s.id === targetCue.id);
    if (idx < 0) return;
    const currentCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
    if (currentCue && currentCue.id !== targetCue.id) {
      useDictationStoreApi.getState().clearFailCount(currentCue.id);
    }
    resetForCueChange();
    panelSetIndexRef.current = idx;
    useSubtitleStoreApi.getState().setActiveIndex(idx);
    startDictationPlaybackForCue(targetCue);
  }, [resetForCueChange, startDictationPlaybackForCue]);

  const handleRevealAnswer = useCallback(() => {
    const curCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
    if (!curCue) return;
    const { failCount: fc } = useDictationStoreApi.getState();
    if ((fc[curCue.id] ?? 0) < unlockAfter) return;
    clearReplayMonitor();
    clearAdvanceTimer();
    usePlaybackStoreApi.getState().playerRef?.pauseVideo();
    useDictationStoreApi.getState().revealAnswer(curCue.id);
    bumpStat('revealCount');
    recordStudySentence();
  }, [unlockAfter, clearReplayMonitor, clearAdvanceTimer, bumpStat, recordStudySentence]);

  const replayCurrentCue = useCallback(() => {
    const curCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
    if (!curCue) return;
    clearAdvanceTimer();
    startDictationPlaybackForCue(curCue);
    bumpStat('replayCount');
  }, [clearAdvanceTimer, startDictationPlaybackForCue, bumpStat]);

  const toggleRetryWrongOnly = useCallback(() => {
    const { dictationRetryWrongOnly: prev, dictationWrongCueIds: wrongIds } = useDictationStoreApi.getState();
    const { subtitles: subList } = useSubtitleStoreApi.getState();
    const wrongSubs = subList.filter((s) => wrongIds.includes(s.id));
    if (prev) {
      useDictationStoreApi.getState().setRetryWrongOnly(false);
      return;
    }
    if (wrongSubs.length === 0) return;
    useDictationStoreApi.getState().setRetryWrongOnly(true);
    resetForCueChange();
    const first = wrongSubs[0]!;
    const idx = subList.findIndex((s) => s.id === first.id);
    if (idx >= 0) {
      panelSetIndexRef.current = idx;
      useSubtitleStoreApi.getState().setActiveIndex(idx);
      startDictationPlaybackForCue(first);
    }
  }, [resetForCueChange, startDictationPlaybackForCue]);

  const handleRestartAll = useCallback(() => {
    const { subtitles: subList } = useSubtitleStoreApi.getState();
    if (subList.length === 0) return;
    useDictationStoreApi.getState().hydrateProgress({
      checkedCueIds: [],
      wrongCueIds: [],
      failCount: {},
    });
    setSessionStats(EMPTY_STATS);
    sessionStatsRef.current = EMPTY_STATS;
    setFailTotalByCue({});
    failTotalByCueRef.current = {};
    useDictationStoreApi.getState().setRetryWrongOnly(false);
    resetForCueChange();
    panelSetIndexRef.current = 0;
    useSubtitleStoreApi.getState().setActiveIndex(0);
    const first = subList[0]!;
    startDictationPlaybackForCue(first);
  }, [resetForCueChange, startDictationPlaybackForCue]);

  const lifecycleCallbacksRef = useRef({
    clearReplayMonitor,
    clearAdvanceTimer,
    clearProgressSaveTimer,
    flushProgressSnapshot,
    startDictationPlaybackForCue,
  });
  lifecycleCallbacksRef.current = {
    clearReplayMonitor,
    clearAdvanceTimer,
    clearProgressSaveTimer,
    flushProgressSnapshot,
    startDictationPlaybackForCue,
  };

  useEffect(() => {
    const progressScopeKey = `${mediaKey}|${subtitleFingerprint}`;
    if (loadedProgressKeyRef.current === progressScopeKey) return;
    loadedProgressKeyRef.current = progressScopeKey;
    restoringProgressRef.current = true;

    const snapshot = plugin.getDictationProgress(mediaKey);
    // No snapshot at all → clean slate (true first-time on this media).
    if (!snapshot) {
      useDictationStoreApi.getState().hydrateProgress({
        checkedCueIds: [],
        wrongCueIds: [],
        failCount: {},
      });
      setSessionStats(EMPTY_STATS);
      sessionStatsRef.current = EMPTY_STATS;
      setFailTotalByCue({});
      failTotalByCueRef.current = {};
      restoringProgressRef.current = false;
      return;
    }
    // NOTE: we used to wipe progress whenever subtitleFingerprint differed,
    // which meant a single typo-fix in the SRT cost the user all their
    // checked/wrong/failCount history. Now we always restore and let the
    // `filterCueIds` effect (which runs on every subtitles change) drop any
    // cue ids that no longer exist. Result: edited subtitles keep all the
    // matching cue ids' progress; only edits that change the cue-index
    // alignment (insertions/deletions) lose alignment, which is acceptable.

    const stats = safeStats(snapshot.stats);
    const failTotals: Record<string, number> = {};
    for (const [cueId, n] of Object.entries(snapshot.failTotalByCue ?? {})) {
      if (typeof n === 'number' && n > 0) failTotals[cueId] = Math.floor(n);
    }

    useDictationStoreApi.getState().hydrateProgress({
      checkedCueIds: snapshot.checkedCueIds ?? [],
      wrongCueIds: snapshot.wrongCueIds ?? [],
      failCount: failTotals,
    });
    setSessionStats(stats);
    sessionStatsRef.current = stats;
    setFailTotalByCue(failTotals);
    failTotalByCueRef.current = failTotals;

    // Resume at the last-practised sentence. We set activeIndex (NOT
    // panelSetIndexRef) so the external-navigation effect re-arms playback for
    // this cue — and the mount effect (which reads getState live) picks it up
    // too when restore runs before mount. Skips the "jumps to the start" bug.
    if (snapshot.lastCueId) {
      const subs = useSubtitleStoreApi.getState().subtitles;
      const savedIdx = subs.findIndex((s) => s.id === snapshot.lastCueId);
      if (savedIdx >= 0 && savedIdx !== useSubtitleStoreApi.getState().activeIndex) {
        useSubtitleStoreApi.getState().setActiveIndex(savedIdx);
      }
    }
    restoringProgressRef.current = false;
  }, [mediaKey, plugin, subtitleFingerprint]);

  useEffect(() => {
    scheduleProgressSave();
  }, [
    dictationCheckedCueIds,
    dictationWrongCueIds,
    failTotalByCue,
    sessionStats,
    cue?.id, // persist the current sentence so we can resume here next time
    scheduleProgressSave,
  ]);

  useEffect(() => {
    useDictationStoreApi.getState().initBoxes(targetChars.length);
    wrongBoxLatchRef.current = new Set();
    correctMarkedCueRef.current = null; // new cue → allow the all-correct logic again
  }, [targetChars.length, cue?.id]);

  // All boxes correct → mark as correct + briefly flash green, then STAY on
  // this cue so the user can record / shadow / replay before moving on. They
  // advance manually via the `next` hotkey (default Enter), which `handleKey`
  // handles in the post-correct branch (see `isLocked || phase === 'correct'`).
  // The loop-mode snapshot is preserved in `pendingLoopRetargetRef` so when
  // they DO press Enter, the new cue picks the loop back up.
  useEffect(() => {
    if (phase !== 'awaitInput' && phase !== 'playing') return;
    if (!cue) return;
    if (!allBoxesCorrect) return;
    // Only run once per cue. Without this guard, replaying a solved cue (which
    // sets phase back to 'playing') would re-enter here and instantly pause the
    // replay — making Space "not work" after the sentence is already correct.
    if (correctMarkedCueRef.current === cue.id) return;
    correctMarkedCueRef.current = cue.id;
    clearReplayMonitor();
    const lm = useLoopStoreApi.getState().mode;
    if (lm.type === 'segmentLoop') {
      pendingLoopRetargetRef.current = { type: 'segmentLoop', total: lm.total };
    } else if (lm.type === 'infiniteLoop') {
      pendingLoopRetargetRef.current = { type: 'infiniteLoop' };
    }
    useLoopStoreApi.getState().exitMode();
    usePlaybackStoreApi.getState().playerRef?.pauseVideo();
    useDictationStoreApi.getState().markCorrect(cue.id);
    recordStudySentence();
    // No auto-advance timer — user presses Enter to move on.
  }, [allBoxesCorrect, phase, cue, clearReplayMonitor, recordStudySentence]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Capture-phase document listeners (revealAnswer, playRecording) run before this
    // bubble-phase handler. If one of them already handled the event, bailing here
    // prevents the keystroke from also being interpreted as dictation input (which
    // matters especially when the user rebinds playRecording to a letter key).
    if (e.defaultPrevented) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const isReplayHotkey = isHotkeyMatch(e.key, dictationHotkeys.replay);
    const isHintHotkey = isHotkeyMatch(e.key, dictationHotkeys.hint);
    const isRevealHotkey = isHotkeyMatch(e.key, dictationHotkeys.revealAnswer);
    const isNextHotkey = isHotkeyMatch(e.key, dictationHotkeys.next);

    // Shift + next-hotkey = go to the PREVIOUS sentence (default Shift+Enter).
    // Works in every phase; pure navigation, never marks the cue wrong.
    if (isNextHotkey && e.shiftKey) {
      e.preventDefault();
      goToPrevDictationCue();
      return;
    }

    if (isLocked || phase === 'correct' || phase === 'done') {
      if (isNextHotkey) {
        e.preventDefault();
        goToNextDictationCue();
      } else if (isReplayHotkey) {
        e.preventDefault();
        replayCurrentCue();
      }
      return;
    }

    if (isReplayHotkey) {
      e.preventDefault();
      replayCurrentCue();
      return;
    }
    if (isHintHotkey) {
      e.preventDefault();
      if (!cue) return;
      const { cursor: c } = useDictationStoreApi.getState();
      if (c < 0 || c >= targetChars.length) return;
      const expected = targetChars[c]!;
      useDictationStoreApi.getState().revealLetter(c, expected);
      useDictationStoreApi.getState().markWrongCue(cue.id);
      bumpStat('hintCount');
      return;
    }
    if (isRevealHotkey) {
      if (!canUnlock) return;
      e.preventDefault();
      handleRevealAnswer();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      useDictationStoreApi.getState().clearBoxChar();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const { cursor: c } = useDictationStoreApi.getState();
      useDictationStoreApi.getState().setCursor(c - 1);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const { cursor: c } = useDictationStoreApi.getState();
      useDictationStoreApi.getState().setCursor(c + 1);
      return;
    }
    if (isNextHotkey) {
      // In awaitInput phase, the "next" hotkey acts as a SKIP: move to the next
      // cue without requiring all boxes correct. Mark the cue as wrong so the
      // retry-wrong queue picks it up later — skipping shouldn't be free.
      e.preventDefault();
      if (cue) useDictationStoreApi.getState().markWrongCue(cue.id);
      goToNextDictationCue();
      return;
    }
    if (e.key.length !== 1) return;

    const raw = normalizeDictationKey(e.key, strictness);
    if (!WORD_CHAR_RE.test(raw)) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const state = useDictationStoreApi.getState();
    const { cursor: c, boxInputs: arr } = state;
    if (c >= arr.length) return;
    const expected = targetChars[c];
    const isWrong = raw !== expected;
    if (isWrong && !wrongBoxLatchRef.current.has(c) && cue) {
      useDictationStoreApi.getState().incFailCount(cue.id);
      useDictationStoreApi.getState().markWrongCue(cue.id);
      wrongBoxLatchRef.current.add(c);
      bumpStat('wrongKeystrokes');
      bumpFailTotalForCue(cue.id);
    } else if (!isWrong) {
      wrongBoxLatchRef.current.delete(c);
    }
    useDictationStoreApi.getState().writeBoxChar(raw, c);
  }, [
    bumpFailTotalForCue,
    bumpStat,
    canUnlock,
    cue,
    dictationHotkeys.hint,
    dictationHotkeys.next,
    dictationHotkeys.replay,
    dictationHotkeys.revealAnswer,
    goToNextDictationCue,
    goToPrevDictationCue,
    handleRevealAnswer,
    isLocked,
    phase,
    replayCurrentCue,
    strictness,
    targetChars,
  ]);

  useEffect(() => {
    useDictationStoreApi.getState().setDictationOpen(true);
    useSubtitleStoreApi.getState().setPracticeMode('dictation');
    useLoopStoreApi.getState().exitMode();

    const ui = useUIStoreApi.getState();
    const prevOverlay = ui.overlayMode;
    const hadOverlay = shouldHideOverlay(prevOverlay);
    if (hadOverlay) ui.setOverlayMode('off');

    prevActiveIndexRef.current = useSubtitleStoreApi.getState().activeIndex;
    prevCueIdRef.current = selectCurrentSubtitle(useSubtitleStoreApi.getState())?.id ?? null;

    const curCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
    const recState = useRecordingStoreApi.getState().recorderState;
    const busy = recState === 'preparing' || recState === 'recording' || recState === 'stopping';
    if (curCue && !busy && usePlaybackStoreApi.getState().playerRef) {
      lifecycleCallbacksRef.current.startDictationPlaybackForCue(curCue);
    }

    return () => {
      const callbacks = lifecycleCallbacksRef.current;
      callbacks.clearReplayMonitor();
      callbacks.clearAdvanceTimer();
      callbacks.clearProgressSaveTimer();
      void callbacks.flushProgressSnapshot();
      if (hadOverlay) useUIStoreApi.getState().setOverlayMode(prevOverlay);
      useDictationStoreApi.getState().setDictationOpen(false);
      useSubtitleStoreApi.getState().clearPracticeMode('dictation');
      useDictationStoreApi.getState().resetDictationDraft();
    };
  }, []);

  useEffect(() => {
    const validIds = new Set(subtitles.map((s) => s.id));
    useDictationStoreApi.getState().filterCueIds(validIds);
  }, [subtitles]);

  useEffect(() => {
    if (subtitles.length === 0 || isRecordingBusy) return;
    const subState = useSubtitleStoreApi.getState();
    const { activeIndex: idx } = subState;
    const hasValidActive = idx >= 0 && idx < subtitles.length;
    if (hasValidActive) return;

    const { dictationRetryWrongOnly: retry, dictationWrongCueIds: wrongIds } = useDictationStoreApi.getState();
    let target: SubtitleCue | null = null;
    if (retry) target = subtitles.find((s) => wrongIds.includes(s.id)) ?? null;
    if (!target) target = subtitles[0] ?? null;
    if (!target) return;
    const targetIdx = subtitles.findIndex((s) => s.id === target.id);
    if (targetIdx < 0) return;
    resetForCueChange();
    panelSetIndexRef.current = targetIdx;
    useSubtitleStoreApi.getState().setActiveIndex(targetIdx);
    startDictationPlaybackForCue(target);
  }, [subtitles, isRecordingBusy, resetForCueChange, startDictationPlaybackForCue]);

  useEffect(() => {
    if (dictationRetryWrongOnly && dictationWrongSubtitles.length === 0) {
      useDictationStoreApi.getState().setRetryWrongOnly(false);
    }
  }, [dictationRetryWrongOnly, dictationWrongSubtitles.length]);

  useEffect(() => {
    if (!playerRefState || isRecordingBusy) return;
    const dState = useDictationStoreApi.getState();
    if (!dState.dictationOpen) return;
    if (dState.phase !== 'idle' && dState.phase !== 'playing') return;
    const curCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
    if (!curCue) return;
    const planned = dState.dictationReplayPlan;
    const sameArmed = replayMonitorRef.current !== null && planned?.cueId === curCue.id;
    if (sameArmed) return;
    startDictationPlaybackForCue(curCue);
  }, [playerRefState, isRecordingBusy, startDictationPlaybackForCue]);

  useEffect(() => {
    if (!isRecordingBusy) return;
    clearReplayMonitor();
    clearAdvanceTimer();
    useDictationStoreApi.getState().setReplayPlan(null);
    useLoopStoreApi.getState().exitMode();
  }, [isRecordingBusy, clearReplayMonitor, clearAdvanceTimer]);

  useEffect(() => {
    if (isRecordingBusy) return;
    const tryFocus = () => {
      const el = hiddenInputRef.current;
      if (!el) return;
      if (document.activeElement === el) return;
      el.focus({ preventScroll: true });
    };
    tryFocus();
    const t1 = window.setTimeout(tryFocus, 0);
    const t2 = window.setTimeout(tryFocus, 100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [cue?.id, isRecordingBusy, phase]);

  useEffect(() => {
    if (activeIndex === prevActiveIndexRef.current) return;
    prevActiveIndexRef.current = activeIndex;
    if (panelSetIndexRef.current === activeIndex) {
      panelSetIndexRef.current = null;
      return;
    }
    if (isRecordingBusy) return;
    const oldCueId = prevCueIdRef.current;
    if (oldCueId) useDictationStoreApi.getState().clearFailCount(oldCueId);
    const newCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
    prevCueIdRef.current = newCue?.id ?? null;
    if (!newCue) return;
    resetForCueChange();
    startDictationPlaybackForCue(newCue);
  }, [activeIndex, isRecordingBusy, resetForCueChange, startDictationPlaybackForCue]);

  useEffect(() => {
    prevCueIdRef.current = cue?.id ?? null;
  }, [cue?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (!isHotkeyMatch(e.key, dictationHotkeys.revealAnswer)) return;
      if (!useDictationStoreApi.getState().dictationOpen) return;
      const curCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
      if (!curCue) return;
      const { phase: ph, failCount: fc } = useDictationStoreApi.getState();
      if (ph !== 'awaitInput') return;
      if ((fc[curCue.id] ?? 0) < unlockAfter) return;
      e.preventDefault();
      handleRevealAnswer();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [dictationHotkeys.revealAnswer, unlockAfter, handleRevealAnswer]);

  // Global hotkey: play/pause the user's most recent self-recording.
  // Registered at document level (capture phase) so it fires even when focus
  // sits on the RecordingPlayback ▶ button, not just on the dictation input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const playKey = dictationHotkeys.playRecording ?? '`';
      if (!isHotkeyMatch(e.key, playKey)) return;
      if (!useDictationStoreApi.getState().dictationOpen) return;
      if (!useRecordingStoreApi.getState().lastRecording) return;
      // If focus is in the dictation hidden input, handleKey already deals with it
      // (and may have called preventDefault). The capture-phase check above (defaultPrevented)
      // makes this listener idempotent.
      e.preventDefault();
      dispatchLpEvent('langplayer-toggle-recording-playback');
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [dictationHotkeys.playRecording]);

  // Global hotkey: start / stop the microphone recorder. Same dispatcher
  // pattern as playRecording — fires the `langplayer-toggle-recording` window
  // event that LangPlayerView's PlayerApp listens for. Focus stays on the
  // dictation hidden input (no button is clicked).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const recKey = dictationHotkeys.toggleRecording ?? ';';
      if (!isHotkeyMatch(e.key, recKey)) return;
      if (!useDictationStoreApi.getState().dictationOpen) return;
      e.preventDefault();
      dispatchLpEvent('langplayer-toggle-recording');
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [dictationHotkeys.toggleRecording]);

  // After a recording-playback toggle (the `` ` `` / play button path), focus
  // can drift to the player leaf — so Space (replay) and Enter (next) would stop
  // working since they're normally handled by the hidden input's onKeyDown.
  // Belt: pull focus back to the hidden input (retry across a few ticks because
  // media playback may grab focus a frame later).
  useEffect(() => {
    const refocus = () => {
      if (!useDictationStoreApi.getState().dictationOpen) return;
      const tryFocus = () => {
        const el = hiddenInputRef.current;
        if (!el || document.activeElement === el) return;
        el.focus({ preventScroll: true });
      };
      window.setTimeout(tryFocus, 0);
      window.setTimeout(tryFocus, 150);
      window.setTimeout(tryFocus, 350);
    };
    return listenLpEvent('langplayer-toggle-recording-playback', refocus);
  }, []);

  // Suspenders: a document-level capture fallback for replay (Space) / next
  // (Enter). It ONLY acts when focus is on a NON-interactive element — i.e. the
  // refocus above lost the race and focus is sitting on the player/video/body.
  // When the dictation input (or any input/button) is focused, this is a no-op
  // and the native onKeyDown handles the key, so normal typing is untouched.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!useDictationStoreApi.getState().dictationOpen) return;
      const isReplay = isHotkeyMatch(e.key, dictationHotkeys.replay);
      const isNext = isHotkeyMatch(e.key, dictationHotkeys.next);
      if (!isReplay && !isNext) return;
      const ae = document.activeElement as HTMLElement | null;
      const isInteractive = !!ae && (
        ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable
        || ae.tagName === 'BUTTON' || ae.tagName === 'A' || ae.tagName === 'SELECT'
        || ae.getAttribute('role') === 'button'
      );
      if (isInteractive) return; // native handler (incl. dictation input) deals with it
      if (isReplay) {
        e.preventDefault();
        replayCurrentCue();
        return;
      }
      // isNext below. Shift+next navigates to the previous sentence (pure nav).
      if (e.shiftKey) {
        e.preventDefault();
        goToPrevDictationCue();
        return;
      }
      e.preventDefault();
      const ph = useDictationStoreApi.getState().phase;
      const curCue = selectCurrentSubtitle(useSubtitleStoreApi.getState());
      if (ph === 'awaitInput' && curCue) useDictationStoreApi.getState().markWrongCue(curCue.id);
      goToNextDictationCue();
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [dictationHotkeys.replay, dictationHotkeys.next, replayCurrentCue, goToNextDictationCue, goToPrevDictationCue]);

  const focusHidden = useCallback(() => {
    hiddenInputRef.current?.focus({ preventScroll: true });
  }, []);

  const dismissRecoveryPrompt = useCallback(() => {
    void plugin.dismissStudyRecoveryPrompt()
      .then(setHabitProgress)
      .catch(() => {});
    focusHidden();
  }, [plugin, focusHidden]);

  const handleRecoveryRetryWrong = useCallback(() => {
    dismissRecoveryPrompt();
    if (!dictationRetryWrongOnly && dictationWrongSubtitles.length > 0) {
      toggleRetryWrongOnly();
    }
  }, [dismissRecoveryPrompt, dictationRetryWrongOnly, dictationWrongSubtitles.length, toggleRetryWrongOnly]);

  const handleRecoveryListenOnce = useCallback(() => {
    dismissRecoveryPrompt();
    replayCurrentCue();
  }, [dismissRecoveryPrompt, replayCurrentCue]);

  const renderBox = (boxIdx: number) => {
    const expected = targetChars[boxIdx] ?? '';
    const actual = boxInputs[boxIdx] ?? '';
    const isCurrent = boxIdx === cursor && phase === 'awaitInput' && !isLocked;
    const isHinted = !!hintedBoxes[boxIdx];
    let stateCls = 'lp-box--empty';
    if (isLocked) {
      stateCls = 'lp-box--reveal';
    } else if (isHinted) {
      stateCls = 'lp-box--hinted';
    } else if (actual !== '') {
      stateCls = actual === expected ? 'lp-box--ok' : 'lp-box--wrong';
    }
    const cls = `lp-box ${stateCls}${isCurrent ? ' lp-box--current' : ''}`;
    // Show the target's real capitalization for revealed/correct boxes (so typing
    // lowercase still displays e.g. "Y", "I"); wrong boxes show what the user typed.
    const displayChar = displayChars[boxIdx] ?? expected;
    const display =
      actual === '' && !isLocked
        ? ''
        : isLocked || actual === expected
          ? displayChar
          : actual;
    return (
      <span key={`box-${boxIdx}`} className={cls}>
        {display || ' '}
      </span>
    );
  };

  if (subtitles.length === 0) {
    return (
      <div className="lp-dictation-panel lp-dictation-panel--empty">
        <div className="lp-dictation-empty">{t('dictation.noSubtitles')}</div>
      </div>
    );
  }

  if (phase === 'done') {
    const attempted = dictationCheckedCueIds.length;
    const remaining = dictationWrongCueIds.length;
    const correct = Math.max(0, attempted - remaining);
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return (
      <div className="lp-dictation-panel lp-dictation-panel--done">
        <div className="lp-dictation-done-title">{t('dictation.sessionDone')}</div>
        <div className="lp-dictation-done-stats">
          {correct}/{attempted} {t('dictation.correct')}
        </div>
        <div className="lp-dictation-done-substats">
          <div>{t('dictation.sessionAccuracy')}: {accuracy}%</div>
          <div>{t('dictation.replaysUsed')}: {sessionStats.replayCount}</div>
          <div>{t('dictation.hintsUsed')}: {sessionStats.hintCount}</div>
          <div>{t('dictation.revealsUsed')}: {sessionStats.revealCount}</div>
          <div>{t('dictation.wrongKeystrokes')}: {sessionStats.wrongKeystrokes}</div>
        </div>
        {hardSentences.length > 0 && (
          <div className="lp-dictation-hard-list">
            <div className="lp-dictation-hard-title">{t('dictation.hardestSentences')}</div>
            {hardSentences.map((item) => (
              <div key={item.cueId} className="lp-dictation-hard-item">
                <span className="lp-dictation-hard-count">{item.count}x</span>
                <span className="lp-dictation-hard-text">{item.text}</span>
              </div>
            ))}
          </div>
        )}
        <div className="lp-dictation-actions">
          <button
            className="lp-btn lp-btn-primary"
            onClick={toggleRetryWrongOnly}
            disabled={dictationWrongSubtitles.length === 0}
          >
            {t('dictation.retryWrong')}
          </button>
          <button className="lp-btn" onClick={handleRestartAll}>
            {t('dictation.restartAll')}
          </button>
        </div>
      </div>
    );
  }

  const boxAreaCls = [
    'lp-dictation-boxes',
    phase === 'correct' ? 'lp-dictation-boxes--correct' : '',
    // Long sentences auto-switch to a tighter layout so they fit without
    // forcing the user to resize the pane.
    targetChars.length > 80 ? 'lp-dictation-boxes--compact' : '',
  ].filter(Boolean).join(' ');

  // Progress dots use a roving tabindex: only the current dot is a Tab stop;
  // ArrowLeft/Right/Up/Down + Home/End move focus among the rest. Avoids turning
  // a 200-sentence session into 200 separate Tab stops.
  const dotSubs = dictationRetryWrongOnly ? dictationWrongSubtitles : subtitles;
  const dotRovingPos = Math.max(0, dotSubs.findIndex((s) => s.id === cue?.id));
  const habitPercent = Math.min(
    100,
    Math.round((habitSummary.todaySentenceCount / Math.max(1, habitSummary.dailyGoal)) * 100),
  );
  const habitCardStyle = {
    '--lp-habit-progress': `${habitPercent}%`,
  } as React.CSSProperties;

  return (
    <div className="lp-dictation-panel">
      {showRecoveryCard && (
        <div className="lp-habit-recovery">
          <div className="lp-habit-recovery-main">
            <div className="lp-habit-recovery-title">{t('habit.recoveryTitle')}</div>
            <div className="lp-habit-recovery-body">
              {t('habit.recoveryBeforeDays')}
              <strong>{recoveryStatus.daysAway}</strong>
              {t('habit.recoveryAfterDays')}
            </div>
          </div>
          <div className="lp-habit-recovery-actions">
            <button className="lp-btn lp-btn-primary" onClick={dismissRecoveryPrompt}>
              {t('habit.startSmallPrefix')}{habitSummary.dailyGoal}{t('habit.startSmallSuffix')}
            </button>
            <button
              className="lp-btn"
              onClick={handleRecoveryRetryWrong}
              disabled={dictationWrongSubtitles.length === 0}
            >
              {t('habit.retryWrongSmall')}
            </button>
            <button className="lp-btn" onClick={handleRecoveryListenOnce}>
              {t('habit.listenOnce')}
            </button>
            <button className="lp-btn lp-btn-muted" onClick={dismissRecoveryPrompt}>
              {t('habit.dismissToday')}
            </button>
          </div>
        </div>
      )}
      <div className="lp-dictation-headline">
        <div className="lp-dictation-progress-dots" ref={dotsContainerRef} role="group" aria-label={t('dictation.progress')}>
          {dotSubs.map((sub, i) => {
            const isActive = cue?.id === sub.id;
            const isWrong = wrongCueIdSet.has(sub.id);
            const isChecked = checkedCueIdSet.has(sub.id);
            const state = isActive
              ? (isWrong ? 'active-wrong' : isChecked ? 'active-ok' : 'active')
              : isWrong
                ? 'wrong'
                : isChecked
                  ? 'ok'
                  : 'pending';
            const stateLabel = state === 'pending'
              ? t('dictation.dotPending')
              : state === 'ok' || state === 'active-ok'
                ? t('dictation.dotCorrect')
                : state === 'wrong' || state === 'active-wrong'
                  ? t('dictation.dotWrong')
                  : t('dictation.dotCurrent');
            return (
              <button
                type="button"
                key={sub.id}
                className={`lp-dot lp-dot--${state}`}
                data-dot-state={state}
                data-dot-index={i}
                // Roving tabindex: only the current dot is a Tab stop; arrows
                // move focus among the rest (see onKeyDown).
                tabIndex={i === dotRovingPos ? 0 : -1}
                aria-label={`${stateLabel}: ${sub.textEn || sub.text}`}
                // Don't let a mouse click move focus onto the dot: the panel
                // yanks focus back to the hidden input on the cue/phase change,
                // and that focus tug-of-war (plus the browser scrolling the
                // focused dot into view) makes the panel flicker. preventDefault
                // keeps focus on the input; keyboard users still reach the dot
                // via Tab + arrows + Enter/Space.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => jumpToDictationCue(sub)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    jumpToDictationCue(sub);
                    return;
                  }
                  let target = -1;
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target = i + 1;
                  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target = i - 1;
                  else if (e.key === 'Home') target = 0;
                  else if (e.key === 'End') target = dotSubs.length - 1;
                  else return;
                  e.preventDefault();
                  target = Math.max(0, Math.min(dotSubs.length - 1, target));
                  dotsContainerRef.current
                    ?.querySelector<HTMLElement>(`[data-dot-index="${target}"]`)
                    ?.focus();
                }}
              />
            );
          })}
        </div>
        <div className="lp-dictation-headline-right">
          <span className="lp-dictation-chip">{dictationCurrent}/{dictationTotal}</span>
          <button
            className={`lp-dictation-badge-btn${dictationRetryWrongOnly ? ' lp-dictation-badge-btn--on' : ''}`}
            onClick={toggleRetryWrongOnly}
            disabled={!dictationRetryWrongOnly && dictationWrongSubtitles.length === 0}
            aria-pressed={dictationRetryWrongOnly}
          >
            {dictationRetryWrongOnly ? '✓ ' : ''}{t('dictation.retryWrong')}
          </button>
        </div>
      </div>

      {settings.studyHabit.enabled && (
        <div
          className={`lp-habit-card${habitSummary.completedToday ? ' lp-habit-card--done' : ''}`}
          style={habitCardStyle}
        >
          <div className="lp-habit-goal">
            <span className="lp-habit-goal-value">
              {habitSummary.todaySentenceCount}<span>/{habitSummary.dailyGoal}</span>
            </span>
            <span className="lp-habit-goal-label">{t('habit.today')}</span>
          </div>
          <div className="lp-habit-main">
            <div className="lp-habit-status-row">
              <span className="lp-habit-status">
                {habitSummary.completedToday
                  ? t('habit.goalDone')
                  : `${t('habit.remainingPrefix')}${habitSummary.remainingToday}${t('habit.remainingSuffix')}`}
              </span>
              <span className="lp-habit-percent">{habitPercent}%</span>
            </div>
            <div className="lp-habit-meter" aria-hidden="true">
              <span />
            </div>
          </div>
          <div className="lp-habit-stats">
            <span className="lp-habit-stat">
              <span>{t('habit.streak')}</span>
              <strong>{habitSummary.effectiveStreak}</strong>
            </span>
            <span className="lp-habit-stat">
              <span>{t('habit.bestStreak')}</span>
              <strong>{habitSummary.longestStreak}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Listen-back sits right above the input boxes — the user looks up from
          the boxes and sees it immediately during A/B comparison. SubtitleControls
          hides its own copy when dictationOpen, so only one <audio> is mounted. */}
      <RecordingPlayback />

      <div className={boxAreaCls} onClick={focusHidden}>
        {targetChars.length === 0 ? (
          <div className="lp-dictation-empty-inline">{t('dictation.noCue')}</div>
        ) : (
          tokens.map((tok, ti) => {
            if (tok.kind === 'sep') {
              const cls = `lp-dictation-sep${tok.isSpace ? ' lp-dictation-sep--space' : ''}`;
              return (
                <span key={`sep-${ti}`} className={cls}>
                  {tok.isSpace ? '' : tok.text}
                </span>
              );
            }
            return (
              <span key={`word-${ti}`} className="lp-dictation-word">
                {tok.chars.map((_, ci) => renderBox(tok.startIndex + ci))}
              </span>
            );
          })
        )}
        <input
          ref={hiddenInputRef}
          className="lp-dictation-hidden-input"
          type="text"
          value=""
          onChange={() => {}}
          onKeyDown={handleKey}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t('dictation.placeholder')}
        />
      </div>

      <div className="lp-dictation-actions">
        {isLocked || phase === 'correct' ? (
          <button
            className="lp-btn lp-btn-primary lp-action-grow"
            onClick={(e) => (e.shiftKey ? goToPrevDictationCue() : goToNextDictationCue())}
            disabled={subtitles.length === 0}
            aria-label={`${t('dictation.next')} (${formatHotkeyLabel(dictationHotkeys.next)}) · ${t('dictation.prev')} (Shift)`}
          >
            {t('dictation.next')}
          </button>
        ) : (
          <button
            className="lp-btn lp-action-grow"
            onClick={focusHidden}
            disabled={!cueAnswer}
          >
            {targetChars.length > 0 ? `${boxInputs.filter(Boolean).length}/${targetChars.length}` : '—'}
          </button>
        )}
        <button
          className="lp-btn lp-action-grow"
          onClick={replayCurrentCue}
          disabled={!cue || isRecordingBusy}
          aria-label={`${t('dictation.replay')} — ${hotkeyReplayLabel}`}
        >
          {t('dictation.replay')}
          <span className="lp-dictation-kbd">{hotkeyReplayLabel}</span>
        </button>
      </div>

      {canUnlock && (
        <div className="lp-dictation-unlock">
          <button
            className="lp-dictation-unlock-link"
            onClick={handleRevealAnswer}
          >
            {t('dictation.unlockHint')} <span className="lp-dictation-unlock-esc">({hotkeyRevealLabel})</span>
          </button>
        </div>
      )}

      {!isLocked && phase !== 'correct' && targetChars.length > 0 && (
        <div className="lp-dictation-shortcuts">
          <span className="lp-dictation-kbd">{hotkeyReplayLabel}</span>
          <span className="lp-dictation-shortcut-label">{t('dictation.replay')}</span>
          <span className="lp-dictation-shortcut-sep">·</span>
          <span className="lp-dictation-kbd">{hotkeyHintLabel}</span>
          <span className="lp-dictation-shortcut-label">{t('dictation.hintWord')}</span>
        </div>
      )}
    </div>
  );
}
