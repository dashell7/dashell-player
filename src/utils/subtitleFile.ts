import type { App, TFile } from 'obsidian';
import type { SubtitleCue, SubtitleLineOrder } from '../types';
import { SubtitleParser } from '../services/SubtitleParser';

/**
 * Decode a subtitle file's bytes with BOM-based encoding detection, using the
 * platform-agnostic TextDecoder (works on mobile, unlike Node's Buffer).
 * Handles UTF-16 LE/BE and UTF-8 (with or without BOM).
 */
export function decodeSubtitleArrayBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Read + decode + parse a subtitle TFile from the vault. Works for any media
 * source (including remote URLs, which have no sibling-file auto-detection).
 */
export async function loadSubtitleCues(
  app: App,
  file: TFile,
  lineOrder: SubtitleLineOrder,
): Promise<SubtitleCue[]> {
  const buf = await app.vault.readBinary(file);
  const content = decodeSubtitleArrayBuffer(buf);
  return SubtitleParser.parse(content, undefined, lineOrder);
}
