import { TFile } from 'obsidian';

// ─── Media Source ───────────────────────────────────────────────────────────

export interface MediaSource {
  type: 'local' | 'url';
  url: string;
  displayName?: string;
  timestamp?: number;
  file?: TFile;
}

// ─── Player Reference ───────────────────────────────────────────────────────

export interface PlayerRef {
  seekTo: (seconds: number, type?: 'seconds' | 'fraction') => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getSecondsLoaded: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  getInternalPlayer?: () => HTMLMediaElement | null;
}

// ─── Media Type Detection ───────────────────────────────────────────────────

export type MediaType = 'video' | 'audio';

export const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'avi', 'mov', 'flv', 'wmv', 'm4v', 'ogv',
]);

// NOTE: `webm`/`ogg` are container formats that may hold audio-only or video
// streams; the extension alone can't disambiguate. We keep the sets DISJOINT
// and let `webm` default to video (the common case) — see detectMediaType.
export const AUDIO_EXTENSIONS = new Set([
  'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus',
]);

export function detectMediaType(urlOrPath: string): MediaType {
  // Strip query params and hash before extracting extension
  const clean = urlOrPath.split('?')[0]!.split('#')[0]!;
  const ext = clean.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXTENSIONS.has(ext) ? 'audio' : 'video';
}

// ─── UI Language ───────────────────────────────────────────────────────────

export type UILanguage = 'zh' | 'en';

// ─── Protocol ───────────────────────────────────────────────────────────────

export interface ProtocolParams {
  src?: string;
  t?: string;
  title?: string;
  [key: string]: string | undefined;
}
