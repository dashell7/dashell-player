import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type LangPlayerSettings } from '../src/types';
import { AI_MEANING_SECRET_ID, migrateAiMeaningSecret } from '../src/settings/aiMeaningSecret';

function freshSettings(): LangPlayerSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as LangPlayerSettings;
}

describe('AI meaning secret migration', () => {
  it('moves a legacy key before removing it from settings', () => {
    const settings = freshSettings() as LangPlayerSettings & { aiMeaning: LangPlayerSettings['aiMeaning'] & { apiKey?: string } };
    settings.aiMeaning.apiKey = 'legacy-secret';
    let stored: string | null = null;
    const secretStorage = {
      getSecret: vi.fn(() => stored),
      setSecret: vi.fn((_id: string, secret: string) => { stored = secret; }),
    };

    const result = migrateAiMeaningSecret(settings, secretStorage);

    expect(secretStorage.setSecret).toHaveBeenCalledWith(AI_MEANING_SECRET_ID, 'legacy-secret');
    expect(result).toEqual({ apiKey: 'legacy-secret', settingsChanged: true });
    expect(Object.hasOwn(settings.aiMeaning, 'apiKey')).toBe(false);
  });

  it('keeps an existing SecretStorage value and removes stale plaintext', () => {
    const settings = freshSettings() as LangPlayerSettings & { aiMeaning: LangPlayerSettings['aiMeaning'] & { apiKey?: string } };
    settings.aiMeaning.apiKey = 'old-secret';
    const secretStorage = {
      getSecret: vi.fn(() => 'current-secret'),
      setSecret: vi.fn(),
    };

    const result = migrateAiMeaningSecret(settings, secretStorage);

    expect(result).toEqual({ apiKey: 'current-secret', settingsChanged: true });
    expect(secretStorage.setSecret).not.toHaveBeenCalled();
    expect(Object.hasOwn(settings.aiMeaning, 'apiKey')).toBe(false);
  });

  it('does not remove the legacy key when secret storage fails', () => {
    const settings = freshSettings() as LangPlayerSettings & { aiMeaning: LangPlayerSettings['aiMeaning'] & { apiKey?: string } };
    settings.aiMeaning.apiKey = 'legacy-secret';
    const secretStorage = {
      getSecret: vi.fn(() => null),
      setSecret: vi.fn(() => { throw new Error('storage failed'); }),
    };

    expect(() => migrateAiMeaningSecret(settings, secretStorage)).toThrow('storage failed');
    expect(settings.aiMeaning.apiKey).toBe('legacy-secret');
  });

  it('keeps the legacy key if SecretStorage does not confirm the write', () => {
    const settings = freshSettings() as LangPlayerSettings & { aiMeaning: LangPlayerSettings['aiMeaning'] & { apiKey?: string } };
    settings.aiMeaning.apiKey = 'legacy-secret';
    const secretStorage = {
      getSecret: vi.fn(() => null),
      setSecret: vi.fn(),
    };

    expect(() => migrateAiMeaningSecret(settings, secretStorage)).toThrow('Could not verify');
    expect(settings.aiMeaning.apiKey).toBe('legacy-secret');
  });
});
