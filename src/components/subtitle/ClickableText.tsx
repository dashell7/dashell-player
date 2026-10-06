import { useStoreApi } from '../../store/mediaSession';
/**
 * ClickableText — Renders subtitle text with per-word spans.
 *
 * Clicking a word opens Qiaomu Reader English's dictionary panel and
 * optionally copies the word to clipboard.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Menu, Notice, Platform } from 'obsidian';
import { useMediaViewOptional } from '../../context';
import { usePlaybackStore } from '../../store/playbackStore';
import { useSubtitleStore } from '../../store/subtitleStore';
import { useVocabularyStore } from '../../store/vocabularyStore';
import { segmentWords } from '../../utils';
import { logger } from '../../utils/logger';
import { t } from '../../i18n';
import { getQiaomuReaderLookup, type QiaomuReaderLookup } from '../../services/QiaomuReaderLookup';

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
  /** When true, suppress hover lookup on the video overlay. */
  suppressHoverLookup?: boolean;
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

async function lookupWord(plugin: QiaomuReaderLookup, word: string, el: HTMLElement,
  x: number, y: number, sentence: string, bookTitle: string): Promise<void> {
  try {
    await plugin.openEnglishDictionary(word, { target: el, position: { x, y }, sentence, bookTitle });
  } catch (error) {
    logger.warn('Qiaomu Reader English word lookup failed:', error);
    new Notice(t('notice.readerLookupFailed'));
  }
}

export function ClickableText({
  text,
  isHighlighted,
  highlightColor,
  sentenceEn,
  sentenceZh,
  sourceName,
  suppressHoverLookup = false,
  highlight,
  cueStart,
}: ClickableTextProps) {
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const query = highlight?.trim().toLowerCase() ?? '';
  const ctx = useMediaViewOptional();
  const settings = ctx?.settings;
  const app = ctx?.plugin?.app;
  const hoverTimer = useRef<number | null>(null);
  const hoverOwner = useRef({});

  useEffect(() => () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    getQiaomuReaderLookup(app)?.closeEnglishDictionaryHover?.(hoverOwner.current);
  }, [app]);

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
      const playback = usePlaybackStoreApi.getState();
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

  const openLookup = useCallback((word: string, target: HTMLElement, x: number, y: number) => {
    if (settings?.autoCopyWordOnLookup) {
      try {
        void navigator.clipboard?.writeText(word).catch(() => {});
      } catch (error) {
        logger.warn('Could not copy looked-up word:', error);
      }
    }

    const reader = getQiaomuReaderLookup(app);
    if (!reader) {
      new Notice(t('notice.readerLookupUnavailable'));
      return;
    }
    const source = usePlaybackStoreApi.getState().source;
    void lookupWord(reader, word, target, x, y, sentenceEn || text,
      sourceName || source?.displayName || '');
  }, [app, sentenceEn, settings?.autoCopyWordOnLookup, sourceName, text, usePlaybackStoreApi]);

  const replaySentence = useCallback(() => {
    const playback = usePlaybackStoreApi.getState();
    if (cueStart === undefined || !playback.playerRef) return;
    const subtitles = useSubtitleStoreApi.getState();
    const index = subtitles.subtitles.findIndex(cue => Math.abs(cue.start - cueStart) < 0.01);
    if (index >= 0) {
      subtitles.setActiveIndex(index);
      subtitles.setPlayheadIndex(index);
    }
    playback.playerRef.seekTo(Math.max(0, cueStart), 'seconds');
    playback.playerRef.playVideo();
  }, [cueStart, usePlaybackStoreApi, useSubtitleStoreApi]);

  const handleWordClick = useCallback((e: React.MouseEvent<HTMLSpanElement>, raw: string) => {
    e.stopPropagation();
    const word = cleanWord(raw);
    if (!word) return;

    if (e.altKey) {
      void captureWord(word);
      return;
    }
    openLookup(word, e.currentTarget, e.clientX, e.clientY);
  }, [captureWord, openLookup]);

  const handleWordContextMenu = useCallback((e: React.MouseEvent<HTMLSpanElement>, raw: string) => {
    const word = cleanWord(raw);
    if (!word) return;
    e.preventDefault();
    e.stopPropagation();
    getQiaomuReaderLookup(app)?.closeEnglishDictionaryHover?.(hoverOwner.current);

    const target = e.currentTarget;
    const x = e.clientX;
    const y = e.clientY;
    const menu = new Menu();
    menu
      .addItem(item => item
        .setTitle(t('vocab.lookupWord', {word}))
        .setIcon('search')
        .onClick(() => openLookup(word, target, x, y)))
      .addItem(item => item
        .setTitle(t('vocab.addWord'))
        .setIcon('plus')
        .onClick(() => { void captureWord(word); }));
    if (cueStart !== undefined && usePlaybackStoreApi.getState().playerRef) {
      menu.addItem(item => item
        .setTitle(t('subtitle.playSentence'))
        .setIcon('play')
        .onClick(replaySentence));
    }
    menu.showAtMouseEvent(e.nativeEvent);
  }, [app, captureWord, cueStart, openLookup, replaySentence, usePlaybackStoreApi]);

  const handleWordMouseEnter = useCallback((e: React.MouseEvent<HTMLSpanElement>, raw: string) => {
    if (Platform.isMobile || suppressHoverLookup || !settings?.enableHoverDefinition) return;
    const reader = getQiaomuReaderLookup(app);
    if (!reader?.hoverEnglishDictionary) return;
    const word = cleanWord(raw);
    if (!/[A-Za-z]/.test(word)) return;
    const target = e.currentTarget;
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      if (!target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const source = usePlaybackStoreApi.getState().source;
      try {
        reader.hoverEnglishDictionary?.(word, {
          target,
          position: { x: rect.left + rect.width / 2, y: rect.top },
          sentence: sentenceEn || text,
          sentenceZh: sentenceZh || '',
          bookTitle: sourceName || source?.displayName || '',
          hoverOwner: hoverOwner.current,
        });
      } catch (error) {
        logger.warn('Qiaomu Reader English hover lookup failed:', error);
      }
    }, 200);
  }, [app, sentenceEn, sentenceZh, settings?.enableHoverDefinition,
    sourceName, suppressHoverLookup, text]);

  const handleWordMouseLeave = useCallback(() => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);

  // Segment by the study/target language so no-space languages (Chinese,
  // Japanese, Thai…) become individually clickable words, not one big blob.
  const locale = settings?.targetLanguage ?? 'en';
  const words = useMemo(() => segmentWords(text, locale), [text, locale]);
  const handleWordMouseOver = useCallback((e: React.MouseEvent<HTMLSpanElement>, raw: string) => {
    e.stopPropagation();
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    handleWordMouseEnter(e, raw);
  }, [handleWordMouseEnter]);

  const handleWordMouseOut = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    handleWordMouseLeave();
  }, [handleWordMouseLeave]);

  return (
    <span
      className="lp-clickable-text"
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
          <span
            key={i}
            className={`lp-word${isMatch ? ' lp-word--match' : ''}`}
            style={style}
            onMouseOver={(e) => handleWordMouseOver(e, seg.text)}
            onMouseOut={handleWordMouseOut}
            onClick={(e) => handleWordClick(e, seg.text)}
            onContextMenu={(e) => handleWordContextMenu(e, seg.text)}
          >
            {seg.text}
          </span>
        );
      })}
    </span>
  );
}
