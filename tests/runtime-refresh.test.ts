import { describe, expect, test } from 'vitest';
import {
  createRuntimeRefreshSnapshot,
  getRuntimeRefreshFlags,
} from '../src/settings/runtimeRefresh';
import { DEFAULT_SETTINGS } from '../src/types/settings';
import type { LangPlayerSettings } from '../src/types';

function cloneSettings(): LangPlayerSettings {
  return structuredClone(DEFAULT_SETTINGS);
}

describe('runtimeRefresh', () => {
  test('ignores dictation and study progress when deciding style refreshes', () => {
    const before = createRuntimeRefreshSnapshot(cloneSettings());
    const after = cloneSettings();

    after.dictationProgressByMedia['movie.mp4'] = {
      checkedCueIds: ['cue-1'],
      wrongCueIds: ['cue-2'],
      failTotalByCue: { 'cue-2': 3 },
      stats: {
        replayCount: 2,
        hintCount: 1,
        revealCount: 0,
        wrongKeystrokes: 3,
      },
      subtitleFingerprint: 'abc',
      updatedAt: 123,
      lastCueId: 'cue-2',
    };
    after.studyHabitProgress = {
      ...after.studyHabitProgress,
      lastStudyDate: '2026-06-24',
      lastStudyAt: 123,
      currentStreak: 1,
      longestStreak: 1,
      totalStudyDays: 1,
      daily: {
        '2026-06-24': {
          sentenceCount: 3,
          completedGoal: true,
          updatedAt: 123,
        },
      },
    };

    expect(getRuntimeRefreshFlags(before, after)).toEqual({
      styles: false,
      language: false,
    });
  });

  test('detects style and language setting changes', () => {
    const before = createRuntimeRefreshSnapshot(cloneSettings());

    const styled = cloneSettings();
    styled.subtitleFontSize += 2;
    expect(getRuntimeRefreshFlags(before, styled)).toEqual({
      styles: true,
      language: false,
    });

    const translated = cloneSettings();
    translated.uiLanguage = translated.uiLanguage === 'zh' ? 'en' : 'zh';
    expect(getRuntimeRefreshFlags(before, translated)).toEqual({
      styles: false,
      language: true,
    });
  });
});
