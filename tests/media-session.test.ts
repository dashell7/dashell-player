import { describe, expect, it } from 'vitest';
import { activateMediaSession, releaseMediaSession } from '../src/store/mediaSession';
import { usePlaybackStore } from '../src/store/playbackStore';
import { useSubtitleStore } from '../src/store/subtitleStore';
import { resetMediaStores } from '../src/store';
import { SubtitleParser } from '../src/services/SubtitleParser';

describe('media session ownership', () => {
  it('keeps player and subtitle data isolated; closing the active view restores the previous commands', () => {
    activateMediaSession('first'); const first = usePlaybackStore.forSession('first');
    const player = {pauseVideo() {}} as any;
    const cues = SubtitleParser.parse('1\n00:00:01,000 --> 00:00:02,000\nFirst sentence.\n');
    first.getState().setPlayerRef(player);
    useSubtitleStore.getState().setSubtitles(cues);
    activateMediaSession('second');
    expect(usePlaybackStore.getState().playerRef).toBeNull();
    expect(useSubtitleStore.getState().subtitles).toEqual([]);
    useSubtitleStore.getState().setSubtitles(SubtitleParser.parse('1\n00:00:03,000 --> 00:00:04,000\nSecond sentence.\n'));
    expect(useSubtitleStore.forSession('first').getState().subtitles).toEqual(cues);
    resetMediaStores('second'); releaseMediaSession('second');
    expect(usePlaybackStore.getState().playerRef).toBe(player);
    expect(useSubtitleStore.getState().subtitles).toEqual(cues);
    resetMediaStores('first'); releaseMediaSession('first');
  });
});
