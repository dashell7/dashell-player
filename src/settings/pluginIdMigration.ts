import { normalizePath, type App, type PluginManifest } from 'obsidian';

export type PluginDataIdMigrationStatus =
  | 'already-present'
  | 'no-legacy-data'
  | 'migrated'
  | 'invalid'
  | 'failed';

interface PluginDataIdMigrationOptions {
  adapter: Pick<App['vault']['adapter'], 'exists' | 'read'>;
  configDir: string;
  manifest: PluginManifest;
  legacyPluginId: string;
  saveData: (data: unknown) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function migratePluginDataFromLegacyId({
  adapter,
  configDir,
  manifest,
  legacyPluginId,
  saveData,
}: PluginDataIdMigrationOptions): Promise<PluginDataIdMigrationStatus> {
  const currentDirectory = manifest.dir ?? `${configDir}/plugins/${manifest.id}`;
  const currentDataPath = normalizePath(`${currentDirectory}/data.json`);
  const legacyDataPath = normalizePath(`${configDir}/plugins/${legacyPluginId}/data.json`);

  try {
    if (await adapter.exists(currentDataPath)) return 'already-present';
    if (!(await adapter.exists(legacyDataPath))) return 'no-legacy-data';

    const legacyData: unknown = JSON.parse(await adapter.read(legacyDataPath));
    if (!isRecord(legacyData)) return 'invalid';

    await saveData(legacyData);
    return 'migrated';
  } catch (error) {
    return error instanceof SyntaxError ? 'invalid' : 'failed';
  }
}
