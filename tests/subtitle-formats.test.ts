import { describe, it, expect } from 'vitest';
import { SubtitleParser } from '../src/services/SubtitleParser';

describe('SubtitleParser — format detection', () => {
  it('detects ASS, LRC, SBV, VTT, SRT', () => {
    expect(SubtitleParser.detectFormat('[Script Info]\n[Events]\nFormat: ...')).toBe('ass');
    expect(SubtitleParser.detectFormat('[00:01.50]hello')).toBe('lrc');
    expect(SubtitleParser.detectFormat('0:00:01.000,0:00:03.000\nhi')).toBe('sbv');
    expect(SubtitleParser.detectFormat('WEBVTT\n\n00:01.000 --> 00:02.000\nhi')).toBe('vtt');
    expect(SubtitleParser.detectFormat('1\n00:00:01,000 --> 00:00:02,000\nhi')).toBe('srt');
  });
});

describe('SubtitleParser — LRC', () => {
  it('parses timestamped lyrics; end = next line start', () => {
    const lrc = ['[ti:Song]', '[00:01.00]First line', '[00:03.50]Second line'].join('\n');
    const cues = SubtitleParser.parse(lrc);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1, end: 3.5, text: 'First line' });
    expect(cues[1]!.start).toBe(3.5);
  });

  it('merges same-timestamp lines into a bilingual cue', () => {
    const lrc = ['[00:01.00]Hello there', '[00:01.00]你好', '[00:05.00]Bye'].join('\n');
    const cues = SubtitleParser.parse(lrc, undefined, 'auto');
    expect(cues).toHaveLength(2);
    expect(cues[0]!.textEn).toBe('Hello there');
    expect(cues[0]!.textZh).toBe('你好');
  });
});

describe('SubtitleParser — ASS/SSA', () => {
  it('parses Dialogue lines, strips override tags, keeps text commas', () => {
    const ass = [
      '[Script Info]',
      '[V4+ Styles]',
      'Format: Name, Fontname',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}Hello, world{\\i0}',
    ].join('\n');
    const cues = SubtitleParser.parse(ass);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ start: 1, end: 3, text: 'Hello, world' });
  });

  it('converts \\N to newlines and splits bilingual', () => {
    const ass = [
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
      'Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,Hello\\N你好',
    ].join('\n');
    const cues = SubtitleParser.parse(ass, undefined, 'auto');
    expect(cues).toHaveLength(1);
    expect(cues[0]!.textEn).toBe('Hello');
    expect(cues[0]!.textZh).toBe('你好');
  });
});

describe('SubtitleParser — SBV', () => {
  it('parses YouTube SBV blocks', () => {
    const sbv = ['0:00:01.000,0:00:02.500', 'First', '', '0:00:03.000,0:00:04.000', 'Second'].join('\n');
    const cues = SubtitleParser.parse(sbv);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ start: 1, end: 2.5, text: 'First' });
    expect(cues[1]).toMatchObject({ start: 3, end: 4, text: 'Second' });
  });
});
