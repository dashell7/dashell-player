import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { getQiaomuReaderLookup } from '../src/services/QiaomuReaderLookup';

function createApp(plugins: Record<string, unknown>): App {
  return { plugins: { plugins } } as unknown as App;
}

describe('Dashell Reader lookup discovery', () => {
  it('uses the renamed Dashell Reader plugin ID', () => {
    const reader = { openEnglishDictionary: vi.fn() };

    expect(getQiaomuReaderLookup(createApp({ 'dashell-reader': reader }))).toBe(reader);
  });

  it('continues to recognize the previous Reader plugin ID', () => {
    const reader = { openEnglishDictionary: vi.fn() };

    expect(getQiaomuReaderLookup(createApp({ 'qiaomu-reader-english': reader }))).toBe(reader);
  });

  it('falls back to the previous ID when the renamed plugin has no lookup API', () => {
    const reader = { openEnglishDictionary: vi.fn() };

    expect(getQiaomuReaderLookup(createApp({
      'dashell-reader': {},
      'qiaomu-reader-english': reader,
    }))).toBe(reader);
  });
});
