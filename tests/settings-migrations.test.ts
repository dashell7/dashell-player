import { describe, it, expect } from 'vitest';
import { runSettingsMigrations } from '../src/settings/migrations';
import { DEFAULT_SETTINGS, CURRENT_SETTINGS_VERSION, type LangPlayerSettings } from '../src/types';

function freshSettings(): LangPlayerSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as LangPlayerSettings;
}

describe('runSettingsMigrations', () => {
  it('seeds a complete dictation hotkey set from a legacy (v0) install', () => {
    const s = freshSettings();
    const migrated = runSettingsMigrations(s, 0, CURRENT_SETTINGS_VERSION);
    expect(migrated).toBe(true);
    expect(s.dictation.hotkeys).toEqual({
      replay: 'Space',
      hint: 'Tab',
      revealAnswer: 'Escape',
      next: 'Enter',
      playRecording: '`',
      toggleRecording: ';',
    });
  });

  it('strips removed AI/transcription/download keys (v3)', () => {
    const s = freshSettings() as LangPlayerSettings & Record<string, unknown>;
    s.sttApiKey = 'secret';
    s.ytdlpPath = '/usr/bin/yt-dlp';
    s.translationApiKey = 'key';
    runSettingsMigrations(s, 0, CURRENT_SETTINGS_VERSION);
    expect(s.sttApiKey).toBeUndefined();
    expect(s.ytdlpPath).toBeUndefined();
    expect(s.translationApiKey).toBeUndefined();
  });

  it('clamps an out-of-range unlockShowAnswerAfter', () => {
    const s = freshSettings();
    s.dictation.unlockShowAnswerAfter = 999;
    runSettingsMigrations(s, 0, CURRENT_SETTINGS_VERSION);
    expect(s.dictation.unlockShowAnswerAfter).toBe(5);
  });

  it('repairs an invalid inputStrictness', () => {
    const s = freshSettings();
    (s.dictation as { inputStrictness: string }).inputStrictness = 'bogus';
    runSettingsMigrations(s, 0, CURRENT_SETTINGS_VERSION);
    expect(s.dictation.inputStrictness).toBe('relaxed');
  });

  it('backfills playRecording (v5) and toggleRecording (v6) for an existing v4 user', () => {
    const s = freshSettings();
    s.dictation.hotkeys = {
      replay: 'Space', hint: 'Tab', revealAnswer: 'Escape', next: 'Enter',
    } as LangPlayerSettings['dictation']['hotkeys'];
    runSettingsMigrations(s, 4, CURRENT_SETTINGS_VERSION);
    expect(s.dictation.hotkeys.playRecording).toBe('`');
    expect(s.dictation.hotkeys.toggleRecording).toBe(';');
  });

  it('is a no-op when already at the current version', () => {
    const s = freshSettings() as LangPlayerSettings & Record<string, unknown>;
    s.sttApiKey = 'still-here';
    const migrated = runSettingsMigrations(s, CURRENT_SETTINGS_VERSION, CURRENT_SETTINGS_VERSION);
    expect(migrated).toBe(false);
    // No migration ran, so the stray key is left untouched.
    expect(s.sttApiKey).toBe('still-here');
  });

  it('backfills plugin-owned playback progress for a v7 user', () => {
    const s = freshSettings();
    delete (s as Partial<LangPlayerSettings>).playbackProgressByMedia;
    runSettingsMigrations(s, 7, CURRENT_SETTINGS_VERSION);
    expect(s.playbackProgressByMedia).toEqual({});
  });

  it('does not recreate removed sound-pattern defaults and preserves existing training data', () => {
    const s = freshSettings() as LangPlayerSettings & Record<string, unknown>;
    const progress = { media: { subtitleFingerprint: 'hash', cueProgress: {}, updatedAt: 7 } };
    s.soundPatternProgressByMedia = progress;
    s.aiMeaning = { enabled: true, endpoint: 'https://example.test', model: 'model' };
    delete s.soundPattern;
    runSettingsMigrations(s, 8, CURRENT_SETTINGS_VERSION);
    expect(s).not.toHaveProperty('soundPattern');
    expect(s.soundPatternProgressByMedia).toBe(progress);
    expect(s.aiMeaning).toEqual({ enabled: true, endpoint: 'https://example.test', model: 'model' });
  });

  it('repairs Aloud-style playback bar settings for a v10 user', () => {
    const s = freshSettings() as LangPlayerSettings & Record<string, unknown>;
    s.playbackBarVisibility = 'invalid';
    s.playbackBarDisplay = 'invalid';
    s.playbackBarPosition = 'invalid';
    s.playbackBarAutoHideMs = 99999;
    runSettingsMigrations(s, 10, CURRENT_SETTINGS_VERSION);
    expect(s.playbackBarVisibility).toBe('always');
    expect(s.playbackBarDisplay).toBe('fixed');
    expect(s.playbackBarPosition).toBe('bottom');
    expect(s.playbackBarAutoHideMs).toBe(10000);
  });

  it('adds and sanitizes subtitle associations for a v12 user', () => {
    const s = freshSettings() as LangPlayerSettings & Record<string, unknown>;
    s.subtitleFileByMedia = {
      ' file:Course/lesson.mp4 ': ' Course\\lesson.en.srt ',
      blankPath: '  ',
      invalidValue: 1,
    };

    runSettingsMigrations(s, 12, CURRENT_SETTINGS_VERSION);

    expect(s.subtitleFileByMedia).toEqual({
      'file:Course/lesson.mp4': 'Course/lesson.en.srt',
    });
  });

  it('initializes subtitle associations when upgrading from v12 without data', () => {
    const s = freshSettings();
    delete (s as Partial<LangPlayerSettings>).subtitleFileByMedia;

    runSettingsMigrations(s, 12, CURRENT_SETTINGS_VERSION);

    expect(s.subtitleFileByMedia).toEqual({});
  });
});
