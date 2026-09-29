import type { SubtitlePanelLocation, SubtitleLineOrder } from './subtitle';
import type { UILanguage } from './media';
import type { AiMeaningSettings, SoundPatternProgressSnapshot, SoundPatternSettings } from './soundPattern';

// ─── Plugin Settings ────────────────────────────────────────────────────────

/**
 * Bumped whenever the settings schema changes in a way that requires migration.
 * Migrations live in `loadSettings()` (main.ts) and are keyed off this number.
 *
 * History:
 *   0 / missing — pre-versioned (≤ v0.1.2)
 *   1          — adds explicit `settingsVersion` field; no shape change otherwise
 *   2          — adds `dictation.unlockShowAnswerAfter` (default 5)
 *   3          — strips transcription/AI/translation/TTS/download/shadowing fields
 *   4          — adds dictation persistence/hotkeys/strictness settings
 *   5          — adds `dictation.hotkeys.playRecording` (default backtick)
 *   6          — adds `dictation.hotkeys.toggleRecording` (default semicolon)
 *   7          — adds study habit goals/recovery progress
 *   8          — stores playback resume positions in plugin data
 *   9          — adds sound-pattern training and on-demand AI meanings
 *   10         — moves the AI meaning key to Obsidian SecretStorage
 */
export const CURRENT_SETTINGS_VERSION = 10;

// ─── Dictation Settings ──────────────────────────────────────────────────────

export interface DictationSettings {
  /** Wrong-keystroke count on the same sentence that unlocks "Show answer".
   *  Range: 1–20. Default: 5. */
  unlockShowAnswerAfter: number;
  /** Input strictness:
   *  - strict: literal matching
   *  - relaxed: normalize smart quotes/dashes/full-width chars */
  inputStrictness: 'strict' | 'relaxed';
  /** Dictation panel hotkeys */
  hotkeys: {
    replay: string;
    hint: string;
    revealAnswer: string;
    next: string;
    /** Toggle play/pause of the most recent self-recording for A/B comparison
     *  with the original sentence. Default `` ` `` (backtick) — non-alphanumeric
     *  so it never collides with dictation letter input. */
    playRecording: string;
    /** Start / stop the microphone recorder from inside the dictation panel.
     *  Default `;` (semicolon) — right pinky home-row reach, not a typed char. */
    toggleRecording: string;
  };
}

export interface DictationSessionStats {
  replayCount: number;
  hintCount: number;
  revealCount: number;
  wrongKeystrokes: number;
}

export interface DictationProgressSnapshot {
  checkedCueIds: string[];
  wrongCueIds: string[];
  failTotalByCue: Record<string, number>;
  stats: DictationSessionStats;
  subtitleFingerprint: string;
  updatedAt: number;
  /** Cue id the user was last on — used to resume dictation at the same
   *  sentence after closing & reopening. Optional for backward compat. */
  lastCueId?: string;
}

// ─── Study Habit Settings ───────────────────────────────────────────────────

export interface StudyHabitSettings {
  /** Enable daily goal tracking and recovery prompts. */
  enabled: boolean;
  /** Minimum viable daily goal, counted in practiced dictation sentences. */
  dailySentenceGoal: number;
  /** Show recovery mode after this many full days without practice. */
  recoveryAfterDays: number;
  /** Whether the dictation panel should show the recovery card after a break. */
  showRecoveryPrompt: boolean;
}

export interface StudyHabitDayProgress {
  sentenceCount: number;
  completedGoal: boolean;
  updatedAt: number;
}

export interface StudyHabitProgress {
  lastStudyDate: string;
  lastStudyAt: number;
  currentStreak: number;
  longestStreak: number;
  totalStudyDays: number;
  dismissedRecoveryDate?: string;
  daily: Record<string, StudyHabitDayProgress>;
}

export interface LangPlayerSettings {
  // ── Schema version ──
  settingsVersion: number;

  // ── Audio Recording ──
  audioFolder: string;
  audioFormat: 'wav' | 'webm' | 'mp3';

  // ── Player ──
  /** Register common media extensions (mp4/mp3/…) so double-clicking them in
   *  the file explorer opens LangPlayer. Off avoids conflicts with other media
   *  plugins; the file-menu "Open in LangPlayer" entry works either way.
   *  Takes effect after reloading the plugin. */
  takeOverMediaExtensions: boolean;
  loopCount: number;
  autoPlayNext: boolean;
  playerHeight: number;
  subtitleWidth: number;
  showInlineSubtitles: boolean;
  playbackProgressByMedia: Record<string, number>;

  // ── Subtitle Style ──
  subtitleFontSize: number;
  subtitleFontWeight: string;
  subtitleLineHeight: number;
  subtitleColor: string;
  subtitleTranslationColor: string;
  subtitleBackgroundColor: string;
  subtitleBgOpacity: number;
  subtitleHighlightColor: string;
  showIndexAndTime: boolean;
  wordByWordHighlight: boolean;
  visibleLanguages: string[];
  subtitlePanelLocation: SubtitlePanelLocation;
  subtitlePanelAutoOpen: boolean;

  // ── Language (multilingual learning) ──
  /** BCP-47 code of the study/target language. Drives pronunciation voice
   *  (Web Speech), word segmentation (Intl.Segmenter), and which subtitle line
   *  is treated as the study line. E.g. 'en', 'ja', 'fr', 'es', 'de', 'zh'. */
  targetLanguage: string;
  /** How a bilingual cue's two lines map to study vs. translation. */
  subtitleLineOrder: SubtitleLineOrder;

  // ── Notes ──
  notePath: string;
  noteTemplate: string;

  // ── Hotkeys ──
  hotkeys: {
    playPause: string;
    prevSubtitle: string;
    nextSubtitle: string;
    rewind: string;
    fastForward: string;
    replayCurrent: string;
    volumeUp: string;
    volumeDown: string;
    mute: string;
    speedDown: string;
    speedUp: string;
    speedReset: string;
    toggleSubtitle: string;
    toggleLoop: string;
    abRepeat: string;
    fullscreen: string;
  };

  // ── UI ──
  uiLanguage: UILanguage;

  // ── Vocabulary ──
  vocabHighlightEnabled: boolean;
  vocabFolder: string;          // 生词文件夹 — 每个单词一个 .md
  wordDatabase: string;         // 单词库 — 单个 .md，所有单词按状态分类汇总
  reviewDatabase: string;       // 复习数据库 — 单个 .md，#flashcards 格式给 SR 插件
  autoRefreshDb: boolean;       // 添加/修改单词后自动刷新数据库

  // ── Spaced Repetition ──
  flashcardTag: string;

  // ── Word Lookup (Language Learner integration) ──
  enableHoverDefinition: boolean;
  autoCopyWordOnLookup: boolean;
  /** Play word pronunciation through Web Speech. LangPlayer makes no direct
   *  request, but the selected OS/browser voice may use an online service. */
  enableWordAudio: boolean;

  // ── Dictation ──
  dictation: DictationSettings;
  dictationProgressByMedia: Record<string, DictationProgressSnapshot>;

  // ── Sound-pattern practice ──
  soundPattern: SoundPatternSettings;
  soundPatternProgressByMedia: Record<string, SoundPatternProgressSnapshot>;
  aiMeaning: AiMeaningSettings;

  // ── Study Habit ──
  studyHabit: StudyHabitSettings;
  studyHabitProgress: StudyHabitProgress;
}

// ─── Path Sanitization ───────────────────────────────────────────────────────

/**
 * Sanitize a vault-relative path: strip `..` components and ensure it stays
 * within the vault root. Returns a clean, vault-relative path.
 */
export function sanitizePath(inputPath: string): string {
  const rawParts = inputPath.replace(/\\/g, '/').split('/');
  const stack: string[] = [];
  for (const part of rawParts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join('/');
}

// ─── Dictation Hotkey Defaults ───────────────────────────────────────────────

/**
 * Single source of truth for the default dictation hotkeys. Referenced by
 * DEFAULT_SETTINGS, every settings migration, the settings tab, and the
 * dictation panel — so adding/renaming a hotkey only touches one place.
 */
export const DEFAULT_DICTATION_HOTKEYS: DictationSettings['hotkeys'] = {
  replay: 'Space',
  hint: 'Tab',
  revealAnswer: 'Escape',
  next: 'Enter',
  playRecording: '`',
  toggleRecording: ';',
};

// ─── Default Settings ───────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: LangPlayerSettings = {
  // Schema version
  settingsVersion: CURRENT_SETTINGS_VERSION,

  // Audio Recording
  audioFolder: 'LangPlayer/recordings',
  audioFormat: 'webm',

  // Player
  takeOverMediaExtensions: true,
  loopCount: 3,
  autoPlayNext: false,
  playerHeight: 400,
  subtitleWidth: 400,
  showInlineSubtitles: true,
  playbackProgressByMedia: {},

  // Subtitle Style
  subtitleFontSize: 15,
  subtitleFontWeight: '500',
  subtitleLineHeight: 1.6,
  subtitleColor: '',
  subtitleTranslationColor: '',
  subtitleBackgroundColor: '#000000',
  subtitleBgOpacity: 0.55,
  subtitleHighlightColor: '',
  showIndexAndTime: false,
  wordByWordHighlight: false,
  visibleLanguages: ['en', 'zh'],
  subtitlePanelLocation: 'split',
  subtitlePanelAutoOpen: true,

  // Language
  targetLanguage: 'en',
  subtitleLineOrder: 'auto',

  // Notes
  notePath: 'LangPlayer/notes',
  noteTemplate: '',

  // Hotkeys
  hotkeys: {
    playPause: ' ',
    prevSubtitle: 'ArrowLeft',
    nextSubtitle: 'ArrowRight',
    rewind: 'Shift+ArrowLeft',
    fastForward: 'Shift+ArrowRight',
    replayCurrent: 'Enter',
    volumeUp: 'ArrowUp',
    volumeDown: 'ArrowDown',
    mute: 'm',
    speedDown: '[',
    speedUp: ']',
    speedReset: '\\',
    toggleSubtitle: 'c',
    toggleLoop: 'l',
    abRepeat: 'a',
    fullscreen: 'f',
  },

  // UI
  uiLanguage: 'zh',

  // Vocabulary
  vocabHighlightEnabled: true,
  vocabFolder: 'LangPlayer/vocabulary',
  wordDatabase: '',
  reviewDatabase: '',
  autoRefreshDb: true,

  // Spaced Repetition
  flashcardTag: '#flashcards',

  // Word Lookup
  enableHoverDefinition: true,
  autoCopyWordOnLookup: true,
  // LangPlayer makes no direct TTS request; voice networking is controlled by
  // the selected OS/browser speech service.
  enableWordAudio: true,

  // Dictation
  dictation: {
    unlockShowAnswerAfter: 5,
    inputStrictness: 'relaxed',
    hotkeys: { ...DEFAULT_DICTATION_HOTKEYS },
  },
  dictationProgressByMedia: {},

  // Sound-pattern practice
  soundPattern: { repetitionTarget: 30 },
  soundPatternProgressByMedia: {},
  aiMeaning: {
    enabled: false,
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: '',
  },

  // Study Habit
  studyHabit: {
    enabled: true,
    dailySentenceGoal: 3,
    recoveryAfterDays: 3,
    showRecoveryPrompt: true,
  },
  studyHabitProgress: {
    lastStudyDate: '',
    lastStudyAt: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalStudyDays: 0,
    daily: {},
  },
};
