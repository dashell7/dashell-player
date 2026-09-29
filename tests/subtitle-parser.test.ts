import { describe, it, expect } from 'vitest';
import { SubtitleParser } from '../src/services/SubtitleParser';

describe('SubtitleParser — SRT', () => {
  it('parses basic cues with positional ids and correct times', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      'Hello',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,500',
      'World',
    ].join('\n');
    const cues = SubtitleParser.parse(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ id: 'cue-0', index: 0, start: 1, end: 2, text: 'Hello' });
    expect(cues[1]).toMatchObject({ id: 'cue-1', index: 1, start: 3, end: 4.5, text: 'World' });
  });

  it('normalizes CRLF line endings', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000\r\nHello\r\n';
    const cues = SubtitleParser.parse(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Hello');
  });

  it('strips a leading BOM', () => {
    const srt = '﻿1\n00:00:01,000 --> 00:00:02,000\nHello';
    const cues = SubtitleParser.parse(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Hello');
  });

  it('keeps a 2-line block with no text', () => {
    const srt = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      'World',
    ].join('\n');
    const cues = SubtitleParser.parse(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]!.text).toBe('');
    expect(cues[1]!.text).toBe('World');
  });

  it('tolerates a missing index line (time line first)', () => {
    const srt = '00:00:01,000 --> 00:00:02,000\nHello';
    const cues = SubtitleParser.parse(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Hello');
  });

  it('sorts out-of-order cues by start time and reindexes', () => {
    const srt = [
      '1',
      '00:00:03,000 --> 00:00:04,000',
      'Second',
      '',
      '2',
      '00:00:01,000 --> 00:00:02,000',
      'First',
    ].join('\n');
    const cues = SubtitleParser.parse(srt);
    expect(cues.map((c) => c.text)).toEqual(['First', 'Second']);
    expect(cues.map((c) => c.id)).toEqual(['cue-0', 'cue-1']);
  });

  it('drops degenerate cues where end <= start', () => {
    const srt = [
      '1',
      '00:00:02,000 --> 00:00:02,000',
      'Zero',
      '',
      '2',
      '00:00:03,000 --> 00:00:04,000',
      'Real',
    ].join('\n');
    const cues = SubtitleParser.parse(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ id: 'cue-0', text: 'Real' });
  });

  it('splits bilingual cues into textEn / textZh', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nHello\n你好';
    const cues = SubtitleParser.parse(srt);
    expect(cues[0]!.textEn).toBe('Hello');
    expect(cues[0]!.textZh).toBe('你好');
  });
});

describe('SubtitleParser — VTT', () => {
  it('parses cues and skips WEBVTT header + NOTE blocks', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'Hello',
      '',
      'NOTE this is a comment',
      '',
      '00:00:03.000 --> 00:00:04.000',
      'World',
    ].join('\n');
    const cues = SubtitleParser.parse(vtt);
    expect(cues.map((c) => c.text)).toEqual(['Hello', 'World']);
  });

  it('parses timestamps without an hours component', () => {
    const vtt = 'WEBVTT\n\n01:02.500 --> 01:04.000\nHi';
    const cues = SubtitleParser.parse(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.start).toBeCloseTo(62.5, 3);
  });

  it('tolerates a cue identifier line before the timestamp', () => {
    const vtt = 'WEBVTT\n\nintro\n00:00:01.000 --> 00:00:02.000\nHi';
    const cues = SubtitleParser.parse(vtt);
    expect(cues).toHaveLength(1);
    expect(cues[0]!.text).toBe('Hi');
  });

  it('strips inline VTT tags', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<c.yellow>Hi</c> there';
    const cues = SubtitleParser.parse(vtt);
    expect(cues[0]!.text).toBe('Hi there');
  });
});
