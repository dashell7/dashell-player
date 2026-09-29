import { describe, expect, test } from 'vitest';
import {
  clampSoundPatternTarget,
  completeSoundPatternCue,
  emptySoundPatternCueProgress,
  incrementSoundPatternRepetition,
  isSoundPatternSnapshotCurrent,
  revealSoundPatternStage,
} from '../src/utils/soundPattern';

describe('sound-pattern progress', () => {
  test('keeps text hidden until the imitation target is reached', () => {
    let progress = emptySoundPatternCueProgress(1);
    progress = incrementSoundPatternRepetition(progress, 2, 2);
    expect(progress).toMatchObject({ repetitions: 1, stage: 'imitate' });
    progress = incrementSoundPatternRepetition(progress, 2, 3);
    expect(progress).toMatchObject({ repetitions: 2, stage: 'meaning' });
  });

  test('records an early reveal without treating it as completion', () => {
    const revealed = revealSoundPatternStage(emptySoundPatternCueProgress(1), 'meaning', 30, 2);
    expect(revealed).toMatchObject({ stage: 'meaning', bypassedTarget: true, repetitions: 0 });
    expect(revealed.completedAt).toBeUndefined();
  });

  test('completes only after text is explicitly revealed', () => {
    const text = revealSoundPatternStage(
      revealSoundPatternStage(emptySoundPatternCueProgress(1), 'meaning', 1, 2),
      'text',
      1,
      3,
    );
    const completed = completeSoundPatternCue(text, 4);
    expect(completed).toMatchObject({ stage: 'completed', completedAt: 4 });
  });

  test('clamps the target and rejects stale subtitle snapshots', () => {
    expect(clampSoundPatternTarget(0)).toBe(1);
    expect(clampSoundPatternTarget(101)).toBe(100);
    expect(clampSoundPatternTarget('30')).toBe(30);
    expect(isSoundPatternSnapshotCurrent('new', { subtitleFingerprint: 'old' })).toBe(false);
    expect(isSoundPatternSnapshotCurrent('same', { subtitleFingerprint: 'same' })).toBe(true);
  });
});
