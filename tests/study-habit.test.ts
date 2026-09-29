import { describe, expect, test } from 'vitest';
import {
  createDefaultStudyHabitProgress,
  daysBetweenDateKeys,
  getStudyHabitSummary,
  getStudyRecoveryStatus,
  updateStudyHabitProgress,
} from '../src/utils/studyHabit';
import type { StudyHabitSettings } from '../src/types';

const settings: StudyHabitSettings = {
  enabled: true,
  dailySentenceGoal: 3,
  recoveryAfterDays: 3,
  showRecoveryPrompt: true,
};

describe('studyHabit', () => {
  test('counts days without timezone drift', () => {
    expect(daysBetweenDateKeys('2026-06-20', '2026-06-24')).toBe(4);
    expect(daysBetweenDateKeys('2026-06-24', '2026-06-24')).toBe(0);
    expect(daysBetweenDateKeys('bad', '2026-06-24')).toBe(0);
  });

  test('updates today count and completes the daily goal', () => {
    let progress = createDefaultStudyHabitProgress();
    progress = updateStudyHabitProgress(progress, settings, 1, new Date(2026, 5, 24, 8));
    progress = updateStudyHabitProgress(progress, settings, 2, new Date(2026, 5, 24, 9));

    const summary = getStudyHabitSummary(progress, settings, new Date(2026, 5, 24, 10));
    expect(summary.todaySentenceCount).toBe(3);
    expect(summary.completedToday).toBe(true);
    expect(summary.effectiveStreak).toBe(1);
    expect(progress.totalStudyDays).toBe(1);
  });

  test('continues streak on adjacent days and resets after a gap', () => {
    let progress = createDefaultStudyHabitProgress();
    progress = updateStudyHabitProgress(progress, settings, 1, new Date(2026, 5, 20));
    progress = updateStudyHabitProgress(progress, settings, 1, new Date(2026, 5, 21));
    expect(progress.currentStreak).toBe(2);
    expect(progress.longestStreak).toBe(2);

    progress = updateStudyHabitProgress(progress, settings, 1, new Date(2026, 5, 24));
    expect(progress.currentStreak).toBe(1);
    expect(progress.longestStreak).toBe(2);
    expect(progress.totalStudyDays).toBe(3);
  });

  test('shows and dismisses recovery prompt', () => {
    const progress = updateStudyHabitProgress(
      createDefaultStudyHabitProgress(),
      settings,
      1,
      new Date(2026, 5, 20),
    );
    expect(getStudyRecoveryStatus(progress, settings, new Date(2026, 5, 24))).toEqual({
      shouldShow: true,
      daysAway: 4,
    });

    const dismissed = { ...progress, dismissedRecoveryDate: '2026-06-24' };
    expect(getStudyRecoveryStatus(dismissed, settings, new Date(2026, 5, 24))).toEqual({
      shouldShow: false,
      daysAway: 4,
    });
  });
});
