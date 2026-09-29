import { describe, it, expect } from 'vitest';
import { findIndexAtTime } from '../src/hooks/useMediaSync';
import type { SubtitleCue } from '../src/types';

function cue(index: number, start: number, end: number): SubtitleCue {
  return { id: `cue-${index}`, index, start, end, text: `c${index}` };
}

// Three non-overlapping cues with gaps between them.
const cues: SubtitleCue[] = [cue(0, 1, 2), cue(1, 3, 4), cue(2, 5, 6)];

describe('findIndexAtTime', () => {
  it('returns -1 for an empty list', () => {
    expect(findIndexAtTime([], 1)).toBe(-1);
  });

  it('returns -1 before the first cue', () => {
    expect(findIndexAtTime(cues, 0.5)).toBe(-1);
  });

  it('finds the cue containing the time', () => {
    expect(findIndexAtTime(cues, 1.5)).toBe(0);
    expect(findIndexAtTime(cues, 3.5)).toBe(1);
    expect(findIndexAtTime(cues, 5.5)).toBe(2);
  });

  it('returns -1 in a gap between cues', () => {
    expect(findIndexAtTime(cues, 2.5)).toBe(-1);
    expect(findIndexAtTime(cues, 4.5)).toBe(-1);
  });

  it('returns -1 past the last cue', () => {
    expect(findIndexAtTime(cues, 7)).toBe(-1);
  });

  it('treats cue boundaries as inclusive', () => {
    expect(findIndexAtTime(cues, 1)).toBe(0); // exact start
    expect(findIndexAtTime(cues, 2)).toBe(0); // exact end
    expect(findIndexAtTime(cues, 3)).toBe(1);
  });
});
