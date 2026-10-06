import { describe, expect, it } from 'vitest';
import { isPlaybackBarActivityForSession, shouldShowPlaybackBar } from '../src/components/subtitle/PlaybackBar';

describe('shouldShowPlaybackBar', () => {
  it('always shows in always mode', () => {
    expect(shouldShowPlaybackBar('always', false, false)).toBe(true);
    expect(shouldShowPlaybackBar('always', true, true)).toBe(true);
  });

  it('keeps mobile available but follows playback on desktop', () => {
    expect(shouldShowPlaybackBar('always-mobile', false, true)).toBe(true);
    expect(shouldShowPlaybackBar('always-mobile', false, false)).toBe(false);
    expect(shouldShowPlaybackBar('always-mobile', true, false)).toBe(true);
  });

  it('only shows while playing in playing mode', () => {
    expect(shouldShowPlaybackBar('playing', false, false)).toBe(false);
    expect(shouldShowPlaybackBar('playing', true, false)).toBe(true);
  });

  it('never shows in never mode', () => {
    expect(shouldShowPlaybackBar('never', true, true)).toBe(false);
  });
});

describe('isPlaybackBarActivityForSession', () => {
  it('only reveals the toolbar that owns the media activity', () => {
    expect(isPlaybackBarActivityForSession('session-a', 'session-a')).toBe(true);
    expect(isPlaybackBarActivityForSession('session-a', 'session-b')).toBe(false);
    expect(isPlaybackBarActivityForSession(undefined, 'session-b')).toBe(false);
  });
});
