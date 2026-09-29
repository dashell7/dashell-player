import { describe, it, expect } from 'vitest';
import { SubtitleParser } from '../src/services/SubtitleParser';

const srt = (text: string) => `1\n00:00:01,000 --> 00:00:02,000\n${text}`;

describe('SubtitleParser — bilingual line order', () => {
  it('auto: the CJK line is the translation, the other line is the study line', () => {
    const cues = SubtitleParser.parse(srt('Hello\n你好'), undefined, 'auto');
    expect(cues[0]!.textEn).toBe('Hello');
    expect(cues[0]!.textZh).toBe('你好');
  });

  it('studyFirst: first line is the study language regardless of script', () => {
    const cues = SubtitleParser.parse(srt('Bonjour\nHello'), undefined, 'studyFirst');
    expect(cues[0]!.textEn).toBe('Bonjour');
    expect(cues[0]!.textZh).toBe('Hello');
  });

  it('translationFirst: first line is the translation', () => {
    const cues = SubtitleParser.parse(srt('你好\nHello'), undefined, 'translationFirst');
    expect(cues[0]!.textZh).toBe('你好');
    expect(cues[0]!.textEn).toBe('Hello');
  });

  it('defaults to auto when line order is omitted', () => {
    const cues = SubtitleParser.parse(srt('Hello\n你好'));
    expect(cues[0]!.textEn).toBe('Hello');
    expect(cues[0]!.textZh).toBe('你好');
  });
});
