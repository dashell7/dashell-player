/**
 * ClickableText — Renders subtitle text with per-word spans.
 *
 * Clicking a word triggers Language Learner's queryWord() to open the
 * dictionary panel, and optionally copies the word to clipboard.
 */
import React, { useCallback, useMemo } from 'react';
import { Notice, type App } from 'obsidian';
import { useMediaViewOptional } from '../../context';
import { usePlaybackStore } from '../../store/playbackStore';
import { useVocabularyStore } from '../../store/vocabularyStore';
import { segmentWords } from '../../utils';
import { logger } from '../../utils/logger';
import { t } from '../../i18n';

interface ClickableTextProps {
  text: string;
  isHighlighted?: boolean;
  highlightColor?: string;
  /** English sentence for context */
  sentenceEn?: string;
  /** Chinese translation of sentence */
  sentenceZh?: string;
  /** Source/origin name */
  sourceName?: string;
  /** When true, stop hover bubbling to avoid Language Learner subtitle popup */
  suppressLangrSubtitlePopup?: boolean;
  /** Lower-cased search term; words containing it get a highlight class. */
  highlight?: string;
  /** Start time (seconds) of the cue this text belongs to — stored with
   *  captured words so the vocabulary table can jump back to the sentence. */
  cueStart?: number;
}

/** Strip leading/trailing punctuation to get the clean word for lookup.
 *  Unicode-aware so it works for any script (Latin, CJK, Cyrillic, Arabic, \u2026). */
function cleanWord(raw: string): string {
  return raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

interface LanguageLearnerPluginApi {
  queryWord(word: string, element: HTMLElement, position: { x: number; y: number }): void;
}

function isLanguageLearnerPlugin(value: unknown): value is LanguageLearnerPluginApi {
  return typeof value === 'object'
    && value !== null
    && 'queryWord' in value
    && typeof value.queryWord === 'function';
}

function getLanguageLearnerPlugin(app: App | undefined): LanguageLearnerPluginApi | null {
  if (!app) return null;
  const pluginManager: unknown = Reflect.get(app, 'plugins');
  if (typeof pluginManager !== 'object' || pluginManager === null) return null;
  const plugins: unknown = Reflect.get(pluginManager, 'plugins');
  if (typeof plugins !== 'object' || plugins === null) return null;
  const candidate: unknown = Reflect.get(plugins, 'obsidian-language-learner');
  return isLanguageLearnerPlugin(candidate) ? candidate : null;
}

/** Call Language Learner plugin's queryWord if available. */
function lookupWord(plugin: LanguageLearnerPluginApi, word: string, el: HTMLElement, x: number, y: number): void {
  try {
    plugin.queryWord(word, el, { x, y });
  } catch (error) {
    logger.warn('Language Learner word lookup failed:', error);
  }
}

export function ClickableText({
  text,
  isHighlighted,
  highlightColor,
  sentenceEn,
  sentenceZh,
  sourceName,
  suppressLangrSubtitlePopup = false,
  highlight,
  cueStart,
}: ClickableTextProps) {
  const query = highlight?.trim().toLowerCase() ?? '';
  const ctx = useMediaViewOptional();
  const settings = ctx?.settings;
  const app = ctx?.plugin?.app;

  // Built-in word capture: write the word + sentence context + media back-link
  // into LangPlayer's own vocab DB. Dedupes via the cached findWord.
  const captureWord = useCallback(async (word: string) => {
    const plugin = ctx?.plugin;
    if (!plugin) return;
    try {
      const existing = await plugin.vocabDb.findWord(word);
      if (existing) {
        new Notice(t('notice.wordExists', { word }));
        return;
      }
      const playback = usePlaybackStore.getState();
      const src = playback.source;
      const mediaUrl = src ? (src.file ? src.file.path : src.url) : undefined;
      const mediaTime = cueStart ?? (src ? playback.currentTime : undefined);
      const now = Date.now();
      const entry = {
        word,
        lemma: word.toLowerCase(),
        status: 'unknown' as const,
        context: sentenceEn || text,
        sentenceZh: sentenceZh || undefined,
        source: sourceName || src?.displayName || undefined,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mediaTime !== undefined ? { mediaTime } : {}),
        tags: [],
        createdAt: now,
        updatedAt: now,
        reviewCount: 0,
      };
      const id = await plugin.vocabDb.addWord(entry);
      useVocabularyStore.getState().addEntry({ ...entry, id });
      new Notice(t('notice.wordAdded', { word }));
    } catch {
      new Notice(t('notice.wordAddFailed'));
    }
  }, [ctx, cueStart, sentenceEn, sentenceZh, sourceName, text]);

  const handleWordClick = useCallback((e: React.MouseEvent<HTMLSpanElement>, raw: string) => {
    e.stopPropagation();
    const word = cleanWord(raw);
    if (!word) return;

    // Copy to clipboard if enabled
    if (settings?.autoCopyWordOnLookup) {
      navigator.clipboard.writeText(word).catch(() => {});
    }

    // Alt+click always captures into the built-in vocab DB. A plain click
    // captures too when Language Learner isn't installed — without LL a click
    // previously did (almost) nothing, so capture is the useful default.
    const llPlugin = getLanguageLearnerPlugin(app);
    if (e.altKey || !llPlugin) {
      void captureWord(word);
      return;
    }

    // Open Language Learner dictionary panel
    lookupWord(llPlugin, word, e.currentTarget, e.clientX, e.clientY);
  }, [app, settings, captureWord]);

  // Segment by the study/target language so no-space languages (Chinese,
  // Japanese, Thai…) become individually clickable words, not one big blob.
  const locale = settings?.targetLanguage ?? 'en';
  const words = useMemo(() => segmentWords(text, locale), [text, locale]);
  const stopHoverBubble = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    if (!suppressLangrSubtitlePopup) return;
    e.stopPropagation();
  }, [suppressLangrSubtitlePopup]);

  return (
    // Keep the `lf-clickable-text` class alongside our own `lp-` one: the
    // Language Learner plugin reads `data-sentence-en/-zh` from the closest
    // `.lf-clickable-text` ancestor when building its hover/lookup popup.
    // Renaming it away (during the lp- prefix migration) silently broke that
    // integration. `lp-` drives our styling; `lf-` is the LL contract.
    <span
      className="lp-clickable-text lf-clickable-text"
      data-sentence-en={sentenceEn || text}
      data-sentence-zh={sentenceZh || ''}
      data-source={sourceName || ''}
    >
      {words.map((seg, i) => {
        // Non-word segments (spaces, punctuation) render as plain text.
        if (!seg.isWord) return <span key={i}>{seg.text}</span>;

        const style: React.CSSProperties = isHighlighted
          ? { color: highlightColor ?? 'var(--lp-subtitle-highlight, var(--interactive-accent))' }
          : {};
        const isMatch = query !== '' && cleanWord(seg.text).toLowerCase().includes(query);

        return (
          // `lf-word` is the class Language Learner's document-level mouseover
          // listener matches to trigger the hover dictionary popup. Keep it next
          // to our `lp-word` styling class — without it, hover lookup is dead.
          <span
            key={i}
            className={`lp-word lf-word${isMatch ? ' lp-word--match' : ''}`}
            style={style}
            data-lf-lookup-only={suppressLangrSubtitlePopup ? '1' : undefined}
            onMouseOver={stopHoverBubble}
            onMouseOut={stopHoverBubble}
            onClick={(e) => handleWordClick(e, seg.text)}
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}
