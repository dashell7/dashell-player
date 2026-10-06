import { describe, expect, it } from 'vitest';
import { getSubtitleBaseNameCandidates, isSubtitleBaseNameVariant } from '../src/utils/subtitleFile';

describe('sibling subtitle matching', () => {
  it('ignores whitespace around media basenames', () => {
    expect(getSubtitleBaseNameCandidates('  46 Linden Street  ')).toEqual(['46 Linden Street']);
    expect(isSubtitleBaseNameVariant(['46 Linden Street'], '46 Linden Street.en')).toBe(true);
  });

  it('keeps auto-transcoded names and language-suffixed subtitles', () => {
    const names = getSubtitleBaseNameCandidates('lesson_aac ');
    expect(names).toEqual(['lesson_aac', 'lesson']);
    expect(isSubtitleBaseNameVariant(names, 'lesson.en')).toBe(true);
  });

  it('does not match unrelated subtitles by a loose prefix', () => {
    expect(isSubtitleBaseNameVariant(['lesson'], 'lesson-extra')).toBe(false);
  });
});
