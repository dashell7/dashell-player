import { describe, expect, it } from 'vitest';
import { getPlaybackProgress, updatePlaybackProgress } from '../src/utils/playbackProgress';

describe('playback progress', () => {
  it('stores resumable positions and removes completed media', () => {
    const progress: Record<string, number> = {};
    updatePlaybackProgress(progress, 'episode', 42.8, 100);
    expect(getPlaybackProgress(progress, 'episode')).toBe(42);

    updatePlaybackProgress(progress, 'episode', 96, 100);
    expect(getPlaybackProgress(progress, 'episode')).toBeUndefined();
  });

  it('ignores invalid positions and caps retained media', () => {
    const progress: Record<string, number> = {};
    updatePlaybackProgress(progress, '', 20, 100);
    updatePlaybackProgress(progress, 'invalid', Number.NaN, 100);

    for (let i = 0; i < 105; i += 1) {
      updatePlaybackProgress(progress, `media-${i}`, 20, 100);
    }

    expect(Object.keys(progress)).toHaveLength(100);
    expect(progress['media-0']).toBeUndefined();
    expect(progress['media-104']).toBe(20);
  });
});
