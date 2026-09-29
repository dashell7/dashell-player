import type { SoundPatternCueProgress, SoundPatternStage } from '../types';

export const SOUND_PATTERN_TARGET_MIN = 1;
export const SOUND_PATTERN_TARGET_MAX = 100;

export function clampSoundPatternTarget(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 30;
  return Math.max(SOUND_PATTERN_TARGET_MIN, Math.min(SOUND_PATTERN_TARGET_MAX, Math.floor(value)));
}

export function emptySoundPatternCueProgress(now = Date.now()): SoundPatternCueProgress {
  return { repetitions: 0, stage: 'imitate', updatedAt: now };
}

export function incrementSoundPatternRepetition(
  progress: SoundPatternCueProgress,
  target: number,
  now = Date.now(),
): SoundPatternCueProgress {
  if (progress.stage !== 'imitate') return progress;
  const repetitions = progress.repetitions + 1;
  return {
    ...progress,
    repetitions,
    stage: repetitions >= clampSoundPatternTarget(target) ? 'meaning' : 'imitate',
    updatedAt: now,
  };
}

export function revealSoundPatternStage(
  progress: SoundPatternCueProgress,
  stage: Exclude<SoundPatternStage, 'imitate' | 'completed'>,
  target: number,
  now = Date.now(),
): SoundPatternCueProgress {
  const bypassedTarget = progress.repetitions < clampSoundPatternTarget(target);
  return { ...progress, stage, bypassedTarget: progress.bypassedTarget || bypassedTarget, updatedAt: now };
}

export function completeSoundPatternCue(progress: SoundPatternCueProgress, now = Date.now()): SoundPatternCueProgress {
  return { ...progress, stage: 'completed', completedAt: now, updatedAt: now };
}

export function isSoundPatternSnapshotCurrent(
  fingerprint: string,
  snapshot: { subtitleFingerprint: string } | undefined,
): boolean {
  return !!snapshot && snapshot.subtitleFingerprint === fingerprint;
}
