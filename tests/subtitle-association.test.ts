import { describe, expect, it } from 'vitest';
import {
  buildSubtitleAssociationKey,
  normalizeSubtitleAssociations,
  removeSubtitleAssociationsForDeletedFile,
  updateSubtitleAssociationsForRename,
} from '../src/utils/subtitleAssociation';

describe('subtitle associations', () => {
  it('uses a vault path for local media and the URL for remote media', () => {
    expect(buildSubtitleAssociationKey({
      type: 'local',
      url: 'app://temporary-resource',
      file: { path: 'Course/lesson.mp4' } as never,
    })).toBe('file:Course/lesson.mp4');

    expect(buildSubtitleAssociationKey({
      type: 'url',
      url: '  https://example.test/lesson.mp4?quality=high  ',
    })).toBe('url:https://example.test/lesson.mp4?quality=high');
  });

  it('keeps only non-empty string association pairs from persisted data', () => {
    expect(normalizeSubtitleAssociations({
      ' file:Course/lesson.mp4 ': ' Course\\lesson.en.srt ',
      blankPath: '  ',
      number: 1,
      blankKey: 'subtitles/lesson.srt',
    })).toEqual({
      'file:Course/lesson.mp4': 'Course/lesson.en.srt',
      blankKey: 'subtitles/lesson.srt',
    });
    expect(normalizeSubtitleAssociations([])).toEqual({});
    expect(normalizeSubtitleAssociations(null)).toEqual({});
  });

  it('updates media keys when a media file is renamed', () => {
    const associations = {
      'file:Course/lesson.mp4': 'Course/lesson.en.srt',
      'url:https://example.test/lesson.mp4': 'Remote/lesson.srt',
    };

    expect(updateSubtitleAssociationsForRename(
      associations,
      'Course/lesson.mp4',
      'Course/lesson-01.mp4',
      false,
    )).toEqual({
      'file:Course/lesson-01.mp4': 'Course/lesson.en.srt',
      'url:https://example.test/lesson.mp4': 'Remote/lesson.srt',
    });
  });

  it('updates subtitle paths and local media keys when their folder is renamed', () => {
    const associations = {
      'file:Course/Unit 1/lesson.mp4': 'Course/Unit 1/lesson.en.srt',
      'file:Course/Unit 2/lesson.mp4': 'Course/Unit 2/lesson.srt',
      'url:https://example.test/lesson.mp4': 'Course/Unit 1/remote.srt',
    };

    expect(updateSubtitleAssociationsForRename(
      associations,
      'Course/Unit 1',
      'Course/Unit One',
      true,
    )).toEqual({
      'file:Course/Unit One/lesson.mp4': 'Course/Unit One/lesson.en.srt',
      'file:Course/Unit 2/lesson.mp4': 'Course/Unit 2/lesson.srt',
      'url:https://example.test/lesson.mp4': 'Course/Unit One/remote.srt',
    });
  });

  it('cleans mappings for removed media, subtitle files, and folders', () => {
    const associations = {
      'file:Course/lesson.mp4': 'Course/lesson.en.srt',
      'file:Course/other.mp4': 'Course/other.srt',
      'url:https://example.test/lesson.mp4': 'Course/remote.srt',
    };

    expect(removeSubtitleAssociationsForDeletedFile(
      associations,
      'Course/lesson.mp4',
      false,
    )).toEqual({
      'file:Course/other.mp4': 'Course/other.srt',
      'url:https://example.test/lesson.mp4': 'Course/remote.srt',
    });

    expect(removeSubtitleAssociationsForDeletedFile(
      associations,
      'Course/other.srt',
      true,
    )).toEqual({
      'file:Course/lesson.mp4': 'Course/lesson.en.srt',
      'url:https://example.test/lesson.mp4': 'Course/remote.srt',
    });

    expect(removeSubtitleAssociationsForDeletedFile(
      associations,
      'Course',
      true,
    )).toEqual({});
  });
});
