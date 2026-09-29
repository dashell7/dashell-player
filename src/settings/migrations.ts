import type { LangPlayerSettings } from '../types';
import { DEFAULT_DICTATION_HOTKEYS, DEFAULT_SETTINGS } from '../types';
import { logger } from '../utils';
import { clampSoundPatternTarget } from '../utils/soundPattern';

// ─── Settings schema migrations ───────────────────────────────────────────────
//
// Each entry upgrades settings TO version `to`. They run in order for any
// fromVersion < to <= currentVersion. Extracted from main.ts so the chain is
// unit-testable and the plugin entry stays small.
//
// History (see CURRENT_SETTINGS_VERSION in types/settings.ts):
//   1 — introduce explicit settingsVersion (no shape change)
//   2 — add dictation settings group
//   3 — strip transcription/AI/translation/TTS/download/shadowing fields
//   4 — add dictation persistence + validate hotkeys/strictness
//   5 — add dictation.hotkeys.playRecording
//   6 — add dictation.hotkeys.toggleRecording
//   7 — add study habit goals/recovery progress
//   8 — move playback resume positions into plugin data

interface Migration {
  to: number;
  apply: (s: LangPlayerSettings) => void;
}

/** Coalesce a possibly-missing hotkey string to its default. */
const pick = (v: unknown, fallback: string): string =>
  (typeof v === 'string' && v ? v : fallback);

function seedDictation(s: LangPlayerSettings): void {
  s.dictation = {
    unlockShowAnswerAfter: 5,
    inputStrictness: 'relaxed',
    hotkeys: { ...DEFAULT_DICTATION_HOTKEYS },
  };
}

function seedStudyHabit(s: LangPlayerSettings): void {
  s.studyHabit = {
    enabled: true,
    dailySentenceGoal: 3,
    recoveryAfterDays: 3,
    showRecoveryPrompt: true,
  };
  s.studyHabitProgress = {
    lastStudyDate: '',
    lastStudyAt: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalStudyDays: 0,
    daily: {},
  };
}

const migrations: Migration[] = [
  {
    to: 1,
    apply: () => {
      // v1: introduce explicit settingsVersion field. No shape change.
    },
  },
  {
    to: 2,
    apply: (s) => {
      // v2: introduce dictation settings group. Seed default if missing/malformed.
      const d = s.dictation;
      if (!d || typeof d !== 'object') {
        seedDictation(s);
      } else {
        const n = d.unlockShowAnswerAfter;
        if (typeof n !== 'number' || n < 1 || n > 20) {
          s.dictation = { ...d, unlockShowAnswerAfter: 5 };
        }
      }
    },
  },
  {
    to: 3,
    apply: (s) => {
      // v3: strip transcription / AI / translation / TTS / download / shadowing
      // fields. Object.assign(DEFAULT, raw) preserves unknown keys, so we must
      // explicitly delete them — otherwise they live in data.json forever.
      const STRIPPED_KEYS = [
        'enableVoice2Text', 'speechProvider', 'sttApiKey', 'sttLanguage', 'sttModel',
        'sttBaseUrl', 'recordingSttMode',
        'freeSpeechPrompts',
        'ytdlpPath', 'ffmpegPath', 'downloadFolder', 'downloadProxy',
        'downloadCookieFile', 'downloadCookieBrowser',
        'deepgramApiKey', 'deepgramModel', 'transcriptionLanguage', 'whisperCppPath',
        'translationProvider', 'translationApiKey', 'translationBaseUrl',
        'translationModel', 'ttsModel', 'ttsVoice',
      ];
      const raw = s as unknown as Record<string, unknown>;
      for (const k of STRIPPED_KEYS) delete raw[k];
      if (raw.hotkeys && typeof raw.hotkeys === 'object') {
        const h = raw.hotkeys as Record<string, unknown>;
        delete h.toggleShadowing;
        delete h.record;
      }
      // Re-validate dictation.
      const d = s.dictation;
      if (d && typeof d === 'object') {
        const n = d.unlockShowAnswerAfter;
        if (typeof n !== 'number' || n < 1 || n > 20) {
          s.dictation = { ...d, unlockShowAnswerAfter: 5 };
        }
        if (d.inputStrictness !== 'strict' && d.inputStrictness !== 'relaxed') {
          s.dictation = { ...s.dictation, inputStrictness: 'relaxed' };
        }
        const hk = d.hotkeys as Record<string, unknown> | undefined;
        s.dictation = {
          ...s.dictation,
          hotkeys: {
            replay: pick(hk?.replay, DEFAULT_DICTATION_HOTKEYS.replay),
            hint: pick(hk?.hint, DEFAULT_DICTATION_HOTKEYS.hint),
            revealAnswer: pick(hk?.revealAnswer, DEFAULT_DICTATION_HOTKEYS.revealAnswer),
            next: pick(hk?.next, DEFAULT_DICTATION_HOTKEYS.next),
            playRecording: pick(hk?.playRecording, DEFAULT_DICTATION_HOTKEYS.playRecording),
            toggleRecording: pick(hk?.toggleRecording, DEFAULT_DICTATION_HOTKEYS.toggleRecording),
          },
        };
      }
    },
  },
  {
    to: 4,
    apply: (s) => {
      if (!s.dictationProgressByMedia || typeof s.dictationProgressByMedia !== 'object') {
        s.dictationProgressByMedia = {};
      }
      const d = s.dictation;
      if (!d || typeof d !== 'object') {
        seedDictation(s);
        return;
      }
      if (d.inputStrictness !== 'strict' && d.inputStrictness !== 'relaxed') {
        d.inputStrictness = 'relaxed';
      }
      const hk = d.hotkeys as Record<string, unknown> | undefined;
      d.hotkeys = {
        replay: pick(hk?.replay, DEFAULT_DICTATION_HOTKEYS.replay),
        hint: pick(hk?.hint, DEFAULT_DICTATION_HOTKEYS.hint),
        revealAnswer: pick(hk?.revealAnswer, DEFAULT_DICTATION_HOTKEYS.revealAnswer),
        next: pick(hk?.next, DEFAULT_DICTATION_HOTKEYS.next),
        playRecording: pick(hk?.playRecording, DEFAULT_DICTATION_HOTKEYS.playRecording),
        toggleRecording: pick(hk?.toggleRecording, DEFAULT_DICTATION_HOTKEYS.toggleRecording),
      };
    },
  },
  {
    to: 5,
    apply: (s) => {
      // v5: add `playRecording` hotkey. Backfill for existing users.
      const d = s.dictation;
      if (!d || typeof d !== 'object') return;
      const hk = d.hotkeys as Record<string, unknown> | undefined;
      if (!hk || typeof hk !== 'object') {
        d.hotkeys = { ...DEFAULT_DICTATION_HOTKEYS };
        return;
      }
      if (typeof hk.playRecording !== 'string' || !hk.playRecording) {
        (hk as { playRecording: string }).playRecording = DEFAULT_DICTATION_HOTKEYS.playRecording;
      }
    },
  },
  {
    to: 6,
    apply: (s) => {
      // v6: add `toggleRecording` hotkey. Backfill for existing users.
      const d = s.dictation;
      if (!d || typeof d !== 'object') return;
      const hk = d.hotkeys as Record<string, unknown> | undefined;
      if (!hk || typeof hk !== 'object') {
        d.hotkeys = { ...DEFAULT_DICTATION_HOTKEYS };
        return;
      }
      if (typeof hk.toggleRecording !== 'string' || !hk.toggleRecording) {
        (hk as { toggleRecording: string }).toggleRecording = DEFAULT_DICTATION_HOTKEYS.toggleRecording;
      }
    },
  },
  {
    to: 7,
    apply: (s) => {
      if (!s.studyHabit || typeof s.studyHabit !== 'object') {
        seedStudyHabit(s);
        return;
      }
      s.studyHabit = {
        enabled: typeof s.studyHabit.enabled === 'boolean' ? s.studyHabit.enabled : true,
        dailySentenceGoal:
          typeof s.studyHabit.dailySentenceGoal === 'number'
            ? Math.max(1, Math.min(99, Math.floor(s.studyHabit.dailySentenceGoal)))
            : 3,
        recoveryAfterDays:
          typeof s.studyHabit.recoveryAfterDays === 'number'
            ? Math.max(1, Math.min(30, Math.floor(s.studyHabit.recoveryAfterDays)))
            : 3,
        showRecoveryPrompt:
          typeof s.studyHabit.showRecoveryPrompt === 'boolean'
            ? s.studyHabit.showRecoveryPrompt
            : true,
      };
      if (!s.studyHabitProgress || typeof s.studyHabitProgress !== 'object') {
        s.studyHabitProgress = {
          lastStudyDate: '',
          lastStudyAt: 0,
          currentStreak: 0,
          longestStreak: 0,
          totalStudyDays: 0,
          daily: {},
        };
      } else {
        s.studyHabitProgress = {
          lastStudyDate:
            typeof s.studyHabitProgress.lastStudyDate === 'string'
              ? s.studyHabitProgress.lastStudyDate
              : '',
          lastStudyAt:
            typeof s.studyHabitProgress.lastStudyAt === 'number'
              ? s.studyHabitProgress.lastStudyAt
              : 0,
          currentStreak:
            typeof s.studyHabitProgress.currentStreak === 'number'
              ? Math.max(0, Math.floor(s.studyHabitProgress.currentStreak))
              : 0,
          longestStreak:
            typeof s.studyHabitProgress.longestStreak === 'number'
              ? Math.max(0, Math.floor(s.studyHabitProgress.longestStreak))
              : 0,
          totalStudyDays:
            typeof s.studyHabitProgress.totalStudyDays === 'number'
              ? Math.max(0, Math.floor(s.studyHabitProgress.totalStudyDays))
              : 0,
          dismissedRecoveryDate:
            typeof s.studyHabitProgress.dismissedRecoveryDate === 'string'
              ? s.studyHabitProgress.dismissedRecoveryDate
              : undefined,
          daily:
            s.studyHabitProgress.daily && typeof s.studyHabitProgress.daily === 'object'
              ? s.studyHabitProgress.daily
              : {},
        };
      }
    },
  },
  {
    to: 8,
    apply: (s) => {
      if (!s.playbackProgressByMedia || typeof s.playbackProgressByMedia !== 'object') {
        s.playbackProgressByMedia = {};
      }
    },
  },
  {
    to: 9,
    apply: (s) => {
      const soundPattern = s.soundPattern as Partial<LangPlayerSettings['soundPattern']> | undefined;
      s.soundPattern = { repetitionTarget: clampSoundPatternTarget(soundPattern?.repetitionTarget) };
      if (!s.soundPatternProgressByMedia || typeof s.soundPatternProgressByMedia !== 'object') {
        s.soundPatternProgressByMedia = {};
      }
      const aiMeaning = s.aiMeaning as Partial<LangPlayerSettings['aiMeaning']> | undefined;
      s.aiMeaning = {
        enabled: typeof aiMeaning?.enabled === 'boolean' ? aiMeaning.enabled : false,
        endpoint: typeof aiMeaning?.endpoint === 'string' ? aiMeaning.endpoint.trim() : '',
        model: typeof aiMeaning?.model === 'string' ? aiMeaning.model.trim() : '',
      };
    },
  },
  {
    to: 10,
    apply: (s) => {
      const aiMeaning = s.aiMeaning as Partial<LangPlayerSettings['aiMeaning']> | undefined;
      s.aiMeaning = {
        enabled: typeof aiMeaning?.enabled === 'boolean' ? aiMeaning.enabled : false,
        endpoint:
          typeof aiMeaning?.endpoint === 'string'
            ? aiMeaning.endpoint.trim()
            : DEFAULT_SETTINGS.aiMeaning.endpoint,
        model: typeof aiMeaning?.model === 'string' ? aiMeaning.model.trim() : '',
      };
    },
  },
];

/**
 * Apply all migrations from `fromVersion` up to `currentVersion` (inclusive),
 * mutating `settings` in place. Returns whether any migration ran.
 */
export function runSettingsMigrations(
  settings: LangPlayerSettings,
  fromVersion: number,
  currentVersion: number,
): boolean {
  let migrated = false;
  for (const m of migrations) {
    if (fromVersion < m.to && m.to <= currentVersion) {
      try {
        m.apply(settings);
        migrated = true;
      } catch (e) {
        logger.warn(`[LangPlayer] Settings migration to v${m.to} failed:`, e);
      }
    }
  }
  return migrated;
}
