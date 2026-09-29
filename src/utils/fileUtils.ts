import { App, TFolder, normalizePath } from 'obsidian';
import { VIDEO_EXTENSIONS, AUDIO_EXTENSIONS, SUBTITLE_EXTENSIONS } from '../types';

export function getFileExtension(path: string): string {
  // Strip query params and hash only for URLs (not local file paths with # in name)
  let clean = path;
  if (clean.includes('://')) {
    clean = clean.split('?')[0]!.split('#')[0]!;
  }
  return clean.split('.').pop()?.toLowerCase() ?? '';
}

export function isMediaFile(path: string): boolean {
  const ext = getFileExtension(path);
  return VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext);
}

export function isSubtitleFile(path: string): boolean {
  return (SUBTITLE_EXTENSIONS as readonly string[]).includes(getFileExtension(path));
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Local calendar date as `YYYY-MM-DD`. */
export function formatDateYMD(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local date + time as `YYYY-MM-DD HH:mm`. */
export function formatDateYMDHM(d: Date = new Date()): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDateYMD(d)} ${hh}:${mm}`;
}

/**
 * Create a vault folder and any missing parents. No-op if it already exists;
 * throws if a path segment is occupied by a file. Single source of truth for
 * the previously-triplicated "ensure folder" logic.
 */
export async function ensureVaultFolder(app: App, path: string): Promise<void> {
  const normalized = normalizePath(path).replace(/^\/+/, '');
  if (!normalized) return;
  let current = '';
  for (const part of normalized.split('/').filter(Boolean)) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (!existing) {
      await app.vault.createFolder(current);
    } else if (!(existing instanceof TFolder)) {
      throw new Error(`Path is occupied by a file: ${current}`);
    }
  }
}
