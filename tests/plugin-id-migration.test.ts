import { describe, expect, it, vi } from 'vitest';
import { migratePluginDataFromLegacyId } from '../src/settings/pluginIdMigration';

const configDir = '.obsidian';
const currentDataPath = '.obsidian/plugins/dashell-player/data.json';
const legacyDataPath = '.obsidian/plugins/langplayer/data.json';

function createAdapter(initialFiles: Record<string, string> = {}) {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    adapter: {
      exists: vi.fn(async (path: string) => files.has(path)),
      read: vi.fn(async (path: string) => {
        const content = files.get(path);
        if (content === undefined) throw new Error(`Missing file: ${path}`);
        return content;
      }),
    },
  };
}

const manifest = {
  id: 'dashell-player',
  name: 'Dashell Player',
  version: '1.9.2',
  minAppVersion: '1.11.4',
  description: '',
  author: 'dashell',
  dir: '.obsidian/plugins/dashell-player',
};

describe('plugin ID data migration', () => {
  it('copies settings from langplayer without deleting the source', async () => {
    const legacyData = JSON.stringify({ vocabFolder: 'Vocabulary', playbackBarPosition: 'top' });
    const { adapter, files } = createAdapter({ [legacyDataPath]: legacyData });
    const saveData = vi.fn(async (data: unknown) => {
      files.set(currentDataPath, JSON.stringify(data));
    });

    const result = await migratePluginDataFromLegacyId({
      adapter,
      configDir,
      manifest,
      legacyPluginId: 'langplayer',
      saveData,
    });

    expect(result).toBe('migrated');
    expect(JSON.parse(files.get(currentDataPath) ?? 'null')).toEqual(JSON.parse(legacyData));
    expect(files.get(legacyDataPath)).toBe(legacyData);
  });

  it('does not overwrite settings already created under the new ID', async () => {
    const { adapter } = createAdapter({
      [currentDataPath]: '{"vocabFolder":"New"}',
      [legacyDataPath]: '{"vocabFolder":"Old"}',
    });
    const saveData = vi.fn(async () => undefined);

    const result = await migratePluginDataFromLegacyId({
      adapter,
      configDir,
      manifest,
      legacyPluginId: 'langplayer',
      saveData,
    });

    expect(result).toBe('already-present');
    expect(saveData).not.toHaveBeenCalled();
  });

  it('blocks startup migration for malformed settings without touching the source', async () => {
    const { adapter } = createAdapter({ [legacyDataPath]: 'not-json' });
    const saveData = vi.fn(async () => undefined);

    const result = await migratePluginDataFromLegacyId({
      adapter,
      configDir,
      manifest,
      legacyPluginId: 'langplayer',
      saveData,
    });

    expect(result).toBe('invalid');
    expect(saveData).not.toHaveBeenCalled();
  });
});
