import { describe, expect, test } from 'vitest';
import {
  buildDictationMediaKey,
  buildSubtitleFingerprint,
  formatHotkeyLabel,
  isHotkeyMatch,
  normalizeDictationText,
  normalizeDictationDisplay,
  normalizeHotkey,
} from '../src/utils/dictationUtils';

describe('dictationUtils', () => {
  test('normalizes relaxed dictation text', () => {
    const out = normalizeDictationText('Ｈｅｌｌｏ — I’m here', 'relaxed');
    expect(out).toBe("hello - i'm here");
  });

  test('strict dictation keeps punctuation unchanged besides lowercase', () => {
    const out = normalizeDictationText('I’m HERE', 'strict');
    expect(out).toBe('i’m here');
  });

  test('display normalization preserves case and stays length-aligned with matching text', () => {
    const raw = 'Your brother. I found it';
    const match = normalizeDictationText(raw, 'relaxed');
    const display = normalizeDictationDisplay(raw, 'relaxed');
    // Matching text is lower-cased; display keeps original capitalization.
    expect(match).toBe('your brother. i found it');
    expect(display).toBe('Your brother. I found it');
    // Same length + per-index case-insensitive equality → safe to index in lockstep.
    expect(display.length).toBe(match.length);
    for (let i = 0; i < match.length; i++) {
      expect(display[i]!.toLowerCase()).toBe(match[i]);
    }
  });

  test('display normalization still maps width/quotes but keeps case (relaxed)', () => {
    expect(normalizeDictationDisplay('Ｈｅｌｌｏ — I’m', 'relaxed')).toBe("Hello - I'm");
  });

  test('display normalization is identity in strict mode', () => {
    expect(normalizeDictationDisplay('I’m HERE', 'strict')).toBe('I’m HERE');
  });

  test('normalizes hotkeys and matches event keys', () => {
    expect(normalizeHotkey('Esc')).toBe('escape');
    expect(normalizeHotkey(' ')).toBe('space');
    expect(isHotkeyMatch('Escape', 'Esc')).toBe(true);
    expect(isHotkeyMatch(' ', 'Space')).toBe(true);
    expect(isHotkeyMatch('Tab', 'Enter')).toBe(false);
  });

  test('formats hotkey labels for UI', () => {
    expect(formatHotkeyLabel('space')).toBe('Space');
    expect(formatHotkeyLabel('esc')).toBe('Esc');
    expect(formatHotkeyLabel('a')).toBe('A');
  });

  test('builds stable subtitle fingerprint and media key', () => {
    const cues = [
      { id: '1', index: 0, start: 0, end: 1.2, text: 'Hi' },
      { id: '2', index: 1, start: 1.3, end: 2.5, text: 'there' },
    ];
    const fp1 = buildSubtitleFingerprint(cues);
    const fp2 = buildSubtitleFingerprint(cues);
    expect(fp1).toBe(fp2);
    expect(fp1.startsWith('2:')).toBe(true);
    expect(buildDictationMediaKey('https://a.test/v.mp4', fp1)).toBe('src:https://a.test/v.mp4');
    expect(buildDictationMediaKey('', fp1)).toBe(`sub:${fp1}`);
  });
});
