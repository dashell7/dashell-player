import type { StudyHabitProgress, StudyHabitSettings } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_HISTORY_LIMIT = 120;

export interface StudyHabitSummary {
  todayKey: string;
  todaySentenceCount: number;
  dailyGoal: number;
  remainingToday: number;
  completedToday: boolean;
  effectiveStreak: number;
  longestStreak: number;
  totalStudyDays: number;
}

export interface StudyRecoveryStatus {
  shouldShow: boolean;
  daysAway: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getLocalDateKey(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function utcDayFromKey(key: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
}

export function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  const from = utcDayFromKey(fromKey);
  const to = utcDayFromKey(toKey);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.floor(to - from));
}

function clampPositiveInt(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

export function createDefaultStudyHabitProgress(): StudyHabitProgress {
  return {
    lastStudyDate: '',
    lastStudyAt: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalStudyDays: 0,
    daily: {},
  };
}

function trimDailyHistory(daily: StudyHabitProgress['daily']): StudyHabitProgress['daily'] {
  const entries = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length <= DAILY_HISTORY_LIMIT) return daily;
  return Object.fromEntries(entries.slice(-DAILY_HISTORY_LIMIT));
}

export function updateStudyHabitProgress(
  progress: StudyHabitProgress | undefined,
  settings: StudyHabitSettings,
  sentenceDelta = 1,
  now = new Date(),
): StudyHabitProgress {
  const prev = progress ?? createDefaultStudyHabitProgress();
  const todayKey = getLocalDateKey(now);
  const goal = clampPositiveInt(settings.dailySentenceGoal, 3, 99);
  const delta = Math.max(1, Math.floor(sentenceDelta));
  const existingDay = prev.daily?.[todayKey];
  const nextSentenceCount = (existingDay?.sentenceCount ?? 0) + delta;

  const daysSinceLast = prev.lastStudyDate ? daysBetweenDateKeys(prev.lastStudyDate, todayKey) : 0;
  const sameDay = prev.lastStudyDate === todayKey;
  const nextStreak = sameDay
    ? Math.max(1, prev.currentStreak)
    : prev.lastStudyDate && daysSinceLast === 1
      ? Math.max(0, prev.currentStreak) + 1
      : 1;

  const daily = trimDailyHistory({
    ...(prev.daily ?? {}),
    [todayKey]: {
      sentenceCount: nextSentenceCount,
      completedGoal: nextSentenceCount >= goal,
      updatedAt: now.getTime(),
    },
  });

  return {
    ...prev,
    lastStudyDate: todayKey,
    lastStudyAt: now.getTime(),
    currentStreak: nextStreak,
    longestStreak: Math.max(prev.longestStreak ?? 0, nextStreak),
    totalStudyDays: existingDay ? prev.totalStudyDays : Math.max(0, prev.totalStudyDays ?? 0) + 1,
    daily,
  };
}

export function getStudyHabitSummary(
  progress: StudyHabitProgress | undefined,
  settings: StudyHabitSettings,
  now = new Date(),
): StudyHabitSummary {
  const safeProgress = progress ?? createDefaultStudyHabitProgress();
  const todayKey = getLocalDateKey(now);
  const goal = clampPositiveInt(settings.dailySentenceGoal, 3, 99);
  const todaySentenceCount = safeProgress.daily?.[todayKey]?.sentenceCount ?? 0;
  const daysSinceLast = safeProgress.lastStudyDate
    ? daysBetweenDateKeys(safeProgress.lastStudyDate, todayKey)
    : 0;
  const effectiveStreak = safeProgress.lastStudyDate && daysSinceLast <= 1
    ? safeProgress.currentStreak
    : 0;

  return {
    todayKey,
    todaySentenceCount,
    dailyGoal: goal,
    remainingToday: Math.max(0, goal - todaySentenceCount),
    completedToday: todaySentenceCount >= goal,
    effectiveStreak,
    longestStreak: Math.max(0, safeProgress.longestStreak ?? 0),
    totalStudyDays: Math.max(0, safeProgress.totalStudyDays ?? 0),
  };
}

export function getStudyRecoveryStatus(
  progress: StudyHabitProgress | undefined,
  settings: StudyHabitSettings,
  now = new Date(),
): StudyRecoveryStatus {
  if (!settings.enabled || !settings.showRecoveryPrompt || !progress?.lastStudyDate) {
    return { shouldShow: false, daysAway: 0 };
  }
  const todayKey = getLocalDateKey(now);
  const daysAway = daysBetweenDateKeys(progress.lastStudyDate, todayKey);
  const threshold = clampPositiveInt(settings.recoveryAfterDays, 3, 30);
  return {
    shouldShow: daysAway >= threshold && progress.dismissedRecoveryDate !== todayKey,
    daysAway,
  };
}
