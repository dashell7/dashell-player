import { describe, expect, it } from 'vitest';
import { clampLayoutSize, readWorkbenchLayouts, WORKBENCH_LAYOUT_KEY } from '../src/utils/workbenchLayout';

describe('workbench layout persistence', () => {
  it('restores independent sizes for all three modes', () => {
    const saved = {
      listen: { media: 65, transcript: 35 },
      dictation: { media: 40, transcript: 25 },
      shadow: { media: 50, transcript: 45 },
    };
    expect(readWorkbenchLayouts({ getItem: key => key === WORKBENCH_LAYOUT_KEY ? JSON.stringify(saved) : null })).toEqual(saved);
  });

  it('ignores malformed layouts without losing other modes', () => {
    expect(readWorkbenchLayouts({ getItem: () => JSON.stringify({ listen: { media: '60', transcript: 32 }, shadow: { media: 50, transcript: 40 } }) }))
      .toEqual({ shadow: { media: 50, transcript: 40 } });
    for (const value of [null, 'null', '{broken']) {
      expect(readWorkbenchLayouts({ getItem: () => value })).toEqual({});
    }
    expect(readWorkbenchLayouts({ getItem: () => { throw new Error('Unavailable'); } })).toEqual({});
  });

  it('constrains saved sizes and drag values so panes remain usable', () => {
    expect(readWorkbenchLayouts({ getItem: () => '{"listen":{"media":-50,"transcript":200}}' }))
      .toEqual({ listen: { media: 15, transcript: 85 } });
    expect(clampLayoutSize(-10)).toBe(15);
    expect(clampLayoutSize(200)).toBe(85);
    expect(clampLayoutSize(42)).toBe(42);
  });
});
