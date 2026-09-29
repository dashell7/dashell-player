import { describe, it, expect } from 'vitest';
import { segmentWords } from '../src/utils/segment';

describe('segmentWords', () => {
  it('returns [] for empty input', () => {
    expect(segmentWords('', 'en')).toEqual([]);
  });

  it('round-trips: concatenating all segments reconstructs the input', () => {
    const input = 'Hello, world!';
    expect(segmentWords(input, 'en').map((s) => s.text).join('')).toBe(input);
  });

  it('splits space-delimited words and flags them as words', () => {
    const words = segmentWords('hello world', 'en').filter((s) => s.isWord).map((s) => s.text);
    expect(words).toContain('hello');
    expect(words).toContain('world');
  });

  it('marks pure whitespace/punctuation as non-words', () => {
    const segs = segmentWords('a, b', 'en');
    expect(segs.map((s) => s.text).join('')).toBe('a, b');
    expect(segs.some((s) => !s.isWord)).toBe(true);
  });

  it('segments no-space CJK into multiple words when Intl.Segmenter is available', () => {
    const hasSegmenter = typeof (Intl as unknown as { Segmenter?: unknown }).Segmenter === 'function';
    const segs = segmentWords('你好世界', 'zh');
    // Round-trip always holds, regardless of segmenter availability.
    expect(segs.map((s) => s.text).join('')).toBe('你好世界');
    if (hasSegmenter) {
      expect(segs.filter((s) => s.isWord).length).toBeGreaterThanOrEqual(2);
    }
  });
});
