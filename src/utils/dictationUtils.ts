import type { SubtitleCue } from '../types';

const RELAXED_CHAR_MAP: Record<string, string> = {
  '’': '\'',
  '‘': '\'',
  '´': '\'',
  '`': '\'',
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '−': '-',
  '‑': '-',
  '\u00a0': ' ',
  '\u3000': ' ',
};

const HOTKEY_ALIASES: Record<string, string> = {
  ' ': 'space',
  spacebar: 'space',
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  left: 'arrowleft',
  right: 'arrowright',
  up: 'arrowup',
  down: 'arrowdown',
};

function normalizeFullWidthChar(ch: string): string {
  if (ch === '\u3000') return ' ';
  const code = ch.charCodeAt(0);
  if (code >= 0xff01 && code <= 0xff5e) {
    return String.fromCharCode(code - 0xfee0);
  }
  return ch;
}

export function normalizeDictationText(
  input: string,
  strictness: 'strict' | 'relaxed',
): string {
  const lower = input.toLowerCase();
  if (strictness === 'strict') return lower;

  let out = '';
  for (const rawCh of lower) {
    const half = normalizeFullWidthChar(rawCh);
    out += RELAXED_CHAR_MAP[half] ?? half;
  }
  return out;
}

export function normalizeDictationKey(
  key: string,
  strictness: 'strict' | 'relaxed',
): string {
  return normalizeDictationText(key, strictness);
}

/**
 * Same width/quote normalization as {@link normalizeDictationText} but WITHOUT
 * lower-casing — used purely for display so boxes can show the target's real
 * capitalization (e.g. sentence-initial caps, "I") while matching stays
 * case-insensitive. Length-aligned with normalizeDictationText for ASCII +
 * the mapped punctuation, so the two can be indexed in lockstep.
 */
export function normalizeDictationDisplay(
  input: string,
  strictness: 'strict' | 'relaxed',
): string {
  if (strictness === 'strict') return input;
  let out = '';
  for (const rawCh of input) {
    const half = normalizeFullWidthChar(rawCh);
    out += RELAXED_CHAR_MAP[half] ?? half;
  }
  return out;
}

export function normalizeHotkey(binding: string): string {
  if (binding === ' ') return 'space';
  const cleaned = binding.trim().toLowerCase();
  if (cleaned === '') return '';
  return HOTKEY_ALIASES[cleaned] ?? cleaned;
}

export function formatHotkeyLabel(binding: string): string {
  const normalized = normalizeHotkey(binding);
  if (!normalized) return '';
  if (normalized === 'space') return 'Space';
  if (normalized === 'escape') return 'Esc';
  if (normalized === 'enter') return 'Enter';
  if (normalized === 'tab') return 'Tab';
  return normalized.length === 1
    ? normalized.toUpperCase()
    : normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function isHotkeyMatch(eventKey: string, binding: string): boolean {
  if (!binding.trim()) return false;
  return normalizeHotkey(eventKey) === normalizeHotkey(binding);
}

function hashFNV1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

export function buildSubtitleFingerprint(subtitles: SubtitleCue[]): string {
  if (subtitles.length === 0) return 'empty';
  const payload = subtitles
    .map((s) => `${s.id}|${s.start.toFixed(3)}|${s.end.toFixed(3)}|${(s.textEn ?? s.text).trim()}`)
    .join('\n');
  return `${subtitles.length}:${hashFNV1a(payload)}`;
}

export function buildDictationMediaKey(
  sourceUrl: string | null | undefined,
  subtitleFingerprint: string,
): string {
  if (sourceUrl && sourceUrl.trim()) return `src:${sourceUrl.trim()}`;
  return `sub:${subtitleFingerprint}`;
}
