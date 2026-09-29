export type SoundPatternStage = 'imitate' | 'meaning' | 'text' | 'completed';

export interface SoundPatternSettings {
  repetitionTarget: number;
}

export interface AiMeaningSettings {
  enabled: boolean;
  endpoint: string;
  model: string;
}

export interface SoundPatternCueProgress {
  repetitions: number;
  stage: SoundPatternStage;
  bypassedTarget?: boolean;
  meaning?: string;
  completedAt?: number;
  updatedAt: number;
}

export interface SoundPatternProgressSnapshot {
  subtitleFingerprint: string;
  cueProgress: Record<string, SoundPatternCueProgress>;
  lastCueId?: string;
  updatedAt: number;
}
