import type { SecretStorage } from 'obsidian';
import type { LangPlayerSettings } from '../types';

export const AI_MEANING_SECRET_ID = 'langplayer-ai-meaning';

type SecretStoragePort = Pick<SecretStorage, 'getSecret' | 'setSecret'>;

export interface AiMeaningSecretMigration {
  apiKey: string;
  settingsChanged: boolean;
}

/** Move a legacy plaintext key before the migrated settings are persisted. */
export function migrateAiMeaningSecret(
  settings: LangPlayerSettings,
  secretStorage: SecretStoragePort,
): AiMeaningSecretMigration {
  let apiKey = secretStorage.getSecret(AI_MEANING_SECRET_ID);
  const value = settings.aiMeaning as unknown;
  if (!value || typeof value !== 'object') {
    return { apiKey: apiKey ?? '', settingsChanged: false };
  }

  const aiMeaning = value as LangPlayerSettings['aiMeaning'] & { apiKey?: unknown };
  const hasLegacyKey = Object.prototype.hasOwnProperty.call(aiMeaning, 'apiKey');
  const legacyKey = aiMeaning.apiKey;
  if ((!apiKey || !apiKey.trim()) && typeof legacyKey === 'string' && legacyKey.trim()) {
    secretStorage.setSecret(AI_MEANING_SECRET_ID, legacyKey);
    apiKey = secretStorage.getSecret(AI_MEANING_SECRET_ID);
    if (apiKey !== legacyKey) {
      throw new Error('Could not verify the migrated AI key in Obsidian SecretStorage');
    }
  }

  if (hasLegacyKey) delete aiMeaning.apiKey;
  return { apiKey: apiKey ?? '', settingsChanged: hasLegacyKey };
}
