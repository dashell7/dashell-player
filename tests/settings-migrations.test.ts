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

  it('adds safe sound-pattern and AI-meaning defaults for a v8 user', () => {
    const s = freshSettings();
    delete (s as Partial<LangPlayerSettings>).soundPattern;
    delete (s as Partial<LangPlayerSettings>).soundPatternProgressByMedia;
    delete (s as Partial<LangPlayerSettings>).aiMeaning;
    runSettingsMigrations(s, 8, CURRENT_SETTINGS_VERSION);
    expect(s.soundPattern.repetitionTarget).toBe(30);
    expect(s.soundPatternProgressByMedia).toEqual({});
    expect(s.aiMeaning).toMatchObject({ enabled: false, model: '' });
  });

  it('normalizes AI meaning settings at v10 without a persisted key', () => {
    const s = freshSettings();
    s.aiMeaning = { enabled: true, endpoint: ' https://api.example.test/v1/ ', model: ' model ' };
    runSettingsMigrations(s, 9, CURRENT_SETTINGS_VERSION);
    expect(s.aiMeaning).toEqual({ enabled: true, endpoint: 'https://api.example.test/v1/', model: 'model' });
  });
});
