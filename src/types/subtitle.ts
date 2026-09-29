// ─── Subtitle Cue ───────────────────────────────────────────────────────────

export interface SubtitleCue {
  id: string;
  index: number;
  start: number;
  end: number;
  text: string;
  /** Study / primary line — the language being learned (NOT necessarily English
   *  despite the historical field name). Driven by targetLanguage + line order. */
  textEn?: string;
  /** Translation line — the helper/native-language line (typically the user's
   *  native language). Field name kept for back-compat; semantically "translation". */
  textZh?: string;
}

/**
 * How a bilingual cue's two lines map to study vs. translation.
 *  - auto:            heuristic (the line in the native/CJK script is the translation)
 *  - studyFirst:      first line is the study language, second is the translation
 *  - translationFirst: first line is the translation, second is the study language
 */
export type SubtitleLineOrder = 'auto' | 'studyFirst' | 'translationFirst';

// ─── Subtitle Format ────────────────────────────────────────────────────────

export type SubtitleFormat = 'srt' | 'vtt' | 'lrc' | 'ass' | 'sbv' | 'unknown';

/** File extensions LangPlayer recognizes as subtitles (for auto-pairing,
 *  the manual picker, and isSubtitleFile). 'ssa' shares the ASS parser. */
export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'lrc', 'ass', 'ssa', 'sbv'] as const;

// ─── Subtitle Configuration ─────────────────────────────────────────────────

export interface SubtitleConfig {
  fontSize: number;
  fontWeight: string;
  lineHeight: number;
  fontColor: string;
  translationColor: string;
  highlightColor: string;
  backgroundColor: string;
  textShadow: string;
  position: 'top' | 'center' | 'bottom';
  showEnglish: boolean;
  showChinese: boolean;
  showIndexAndTime: boolean;
  wordByWordHighlight: boolean;
  visibleLanguages: string[];
}

// ─── Subtitle Panel Settings ────────────────────────────────────────────────

export type SubtitlePanelLocation = 'right' | 'left' | 'tab' | 'split';

// ─── Default Subtitle Config ────────────────────────────────────────────────

export const DEFAULT_SUBTITLE_CONFIG: SubtitleConfig = {
  fontSize: 15,
  fontWeight: '500',
  lineHeight: 1.6,
  fontColor: 'var(--text-normal)',
  translationColor: 'var(--text-muted)',
  highlightColor: '#ffeb3b',
  backgroundColor: 'transparent',
  textShadow: '',
  position: 'bottom',
  showEnglish: true,
  showChinese: false,
  showIndexAndTime: false,
  wordByWordHighlight: false,
  visibleLanguages: ['en', 'zh'],
};
