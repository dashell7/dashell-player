import { App, TFile } from 'obsidian';
import type { MediaSource } from '../types';
import { isMediaFile } from '../utils';

export class MediaFileService {
  constructor(private app: App) {}

  createSourceFromFile(file: TFile, timestamp?: number): MediaSource {
    const url = this.app.vault.getResourcePath(file);
    return {
      type: 'local',
      url,
      displayName: file.basename,
      timestamp,
      file,
    };
  }

  createSourceFromUrl(url: string, title?: string, timestamp?: number): MediaSource {
    return {
      type: 'url',
      url,
      displayName: title ?? this.extractTitle(url),
      timestamp,
    };
  }

  getMediaFiles(): TFile[] {
    return this.app.vault.getFiles().filter((f) => isMediaFile(f.path));
  }

  private extractTitle(url: string): string {
    try {
      const u = new URL(url);
      const segments = u.pathname.split('/');
      const last = segments.pop() ?? '';
      return decodeURIComponent(last.replace(/\.[^.]+$/, '')) || u.hostname;
    } catch {
      return url.split('/').pop() ?? url;
    }
  }
}
