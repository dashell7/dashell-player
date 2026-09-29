/**
 * Word segmentation for space-delimited AND no-space languages (Chinese,
 * Japanese, Thai…) via the built-in Intl.Segmenter, with a whitespace fallback
 * when Segmenter is unavailable. Enables click-to-look-up and word grouping for
 * languages that don't separate words with spaces.
 */

export interface WordSegment {
  /** The raw segment text (including whitespace/punctuation segments). */
  text: string;
  /** True for a word-like segment (a real word), false for spaces/punctuation. */
  isWord: boolean;
}

// Minimal typed shape for Intl.Segmenter — it isn't in the project's TS lib
// target, so we feature-detect it at runtime instead of relying on lib types.
type SegmenterCtor = new (
  locale: string,
  options: { granularity: 'word' | 'grapheme' | 'sentence' },
) => { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

function whitespaceFallback(text: string): WordSegment[] {
  return text
    .split(/(\s+)/)
    .filter((s) => s.length > 0)
    .map((s) => ({ text: s, isWord: !/^\s+$/.test(s) && /[\p{L}\p{N}]/u.test(s) }));
}

/**
 * Split `text` into word / non-word segments for the given BCP-47 locale.
 * CJK/Thai are segmented into real words when Intl.Segmenter is available.
 */
export function segmentWords(text: string, locale = 'en'): WordSegment[] {
  if (!text) return [];
  const Segmenter = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  if (typeof Segmenter !== 'function') return whitespaceFallback(text);
  try {
    const segmenter = new Segmenter(locale, { granularity: 'word' });
    const out: WordSegment[] = [];
    for (const part of segmenter.segment(text)) {
      out.push({ text: part.segment, isWord: !!part.isWordLike });
    }
    return out;
  } catch {
    return whitespaceFallback(text);
  }
}
