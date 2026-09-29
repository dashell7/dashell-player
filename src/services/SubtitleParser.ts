import type { SubtitleCue, SubtitleFormat, SubtitleLineOrder } from '../types';

// Shared timestamp matchers.
// SRT uses HH:MM:SS,mmm (comma) but tolerate '.'; VTT uses MM:SS.mmm with an
// optional HH: group.
const SRT_TIME_RE =
  /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/;
const VTT_TIME_RE =
  /(?:(\d{1,2}):)?(\d{2}):(\d{2})[.](\d{3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.](\d{3})/;

const BOM_RE = /^\uFEFF/;

export class SubtitleParser {
  static parse(
    content: string,
    format?: SubtitleFormat,
    lineOrder: SubtitleLineOrder = 'auto',
  ): SubtitleCue[] {
    // Normalize up front: strip a leading BOM and unify CR/CRLF → LF so every
    // downstream matcher can assume clean '\n'-separated text.
    const normalized = content.replace(BOM_RE, '').replace(/\r\n?/g, '\n');
    const detected = format && format !== 'unknown' ? format : this.detectFormat(normalized);
    let cues: SubtitleCue[];
    switch (detected) {
      case 'vtt': cues = this.parseVTT(normalized, lineOrder); break;
      case 'lrc': cues = this.parseLRC(normalized, lineOrder); break;
      case 'ass': cues = this.parseASS(normalized, lineOrder); break;
      case 'sbv': cues = this.parseSBV(normalized, lineOrder); break;
      default: cues = this.parseSRT(normalized, lineOrder);
    }
    return this.finalize(cues);
  }

  static detectFormat(content: string): SubtitleFormat {
    const c = content.replace(BOM_RE, '').trimStart();
    if (c.startsWith('WEBVTT')) return 'vtt';
    // ASS/SSA: section headers in the script.
    if (/^\[(Script Info|V4\+? Styles|Events)\]/im.test(c)) return 'ass';
    // LRC: a line beginning with a [mm:ss(.xx)] time tag.
    if (/^\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/m.test(c)) return 'lrc';
    // SBV (YouTube): "H:MM:SS.mmm,H:MM:SS.mmm" time pair, no '-->'.
    if (!c.includes('-->') && /^\d{1,2}:\d{2}:\d{2}\.\d{3}\s*,\s*\d{1,2}:\d{2}:\d{2}\.\d{3}/m.test(c)) return 'sbv';
    return 'srt';
  }

  // ─── SRT Parser ─────────────────────────────────────────────────────────

  private static parseSRT(content: string, lineOrder: SubtitleLineOrder): SubtitleCue[] {
    const cues: SubtitleCue[] = [];

    for (const block of content.split(/\n\n+/)) {
      const lines = block.split('\n').map((l) => l.replace(/\s+$/, ''));
      // Locate the timestamp line. Blocks normally start with an index line,
      // but tolerate a missing index (time line first). Text after it may be
      // empty (valid silent/placeholder cues) — don't require ≥3 lines.
      const timeLineIdx = lines.findIndex((l) => SRT_TIME_RE.test(l));
      if (timeLineIdx === -1) continue;

      const m = lines[timeLineIdx]!.match(SRT_TIME_RE);
      if (!m) continue;

      const start = this.toSeconds(m[1]!, m[2]!, m[3]!, m[4]!);
      const end = this.toSeconds(m[5]!, m[6]!, m[7]!, m[8]!);
      const text = lines.slice(timeLineIdx + 1).join('\n').trim();
      const { textEn, textZh } = this.splitBilingual(text, lineOrder);

      cues.push({ id: '', index: 0, start, end, text, textEn, textZh });
    }

    return cues;
  }

  // ─── VTT Parser ─────────────────────────────────────────────────────────

  private static parseVTT(content: string, lineOrder: SubtitleLineOrder): SubtitleCue[] {
    const cues: SubtitleCue[] = [];

    for (const rawBlock of content.split(/\n\n+/)) {
      const lines = rawBlock.split('\n').map((l) => l.replace(/\s+$/, ''));
      // Drop a leading WEBVTT header line (with optional trailing text).
      if (lines[0] && /^WEBVTT/.test(lines[0])) lines.shift();
      if (lines.length === 0) continue;
      // Skip metadata blocks.
      if (/^(NOTE|STYLE|REGION)\b/.test(lines[0]!)) continue;

      const timeLineIdx = lines.findIndex((l) => l.includes('-->') && VTT_TIME_RE.test(l));
      if (timeLineIdx === -1) continue;

      const m = lines[timeLineIdx]!.match(VTT_TIME_RE);
      if (!m) continue;

      const start = this.toSeconds(m[1] ?? '00', m[2]!, m[3]!, m[4]!);
      const end = this.toSeconds(m[5] ?? '00', m[6]!, m[7]!, m[8]!);
      const text = lines
        .slice(timeLineIdx + 1)
        .join('\n')
        .replace(/<[^>]+>/g, '') // Strip VTT inline tags
        .trim();
      const { textEn, textZh } = this.splitBilingual(text, lineOrder);

      cues.push({ id: '', index: 0, start, end, text, textEn, textZh });
    }

    return cues;
  }

  // ─── LRC Parser (timestamped lyrics) ─────────────────────────────────────

  private static parseLRC(content: string, lineOrder: SubtitleLineOrder): SubtitleCue[] {
    const TIME = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    const raw: { time: number; text: string }[] = [];
    for (const line of content.split('\n')) {
      // Strip every [..] tag (timestamps + [ar:]/[ti:] metadata) to get the text.
      const text = line.replace(/\[[^\]]*\]/g, '').trim();
      for (const t of line.matchAll(TIME)) {
        const frac = t[3] ? parseInt(t[3].padEnd(3, '0').slice(0, 3)) / 1000 : 0;
        raw.push({ time: parseInt(t[1]!) * 60 + parseInt(t[2]!) + frac, text });
      }
    }
    raw.sort((a, b) => a.time - b.time);

    const cues: SubtitleCue[] = [];
    for (let i = 0; i < raw.length; ) {
      const time = raw[i]!.time;
      const group: string[] = [];
      let j = i;
      // Merge entries sharing (nearly) the same timestamp — bilingual LRC.
      while (j < raw.length && raw[j]!.time - time < 0.05) {
        if (raw[j]!.text) group.push(raw[j]!.text);
        j++;
      }
      const end = j < raw.length ? raw[j]!.time : time + 4;
      const text = group.join('\n');
      if (text) {
        const { textEn, textZh } = this.splitBilingual(text, lineOrder);
        cues.push({ id: '', index: 0, start: time, end, text, textEn, textZh });
      }
      i = j;
    }
    return cues;
  }

  // ─── ASS / SSA Parser ────────────────────────────────────────────────────

  private static parseASS(content: string, lineOrder: SubtitleLineOrder): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    let inEvents = false;
    let startIdx = 1, endIdx = 2, textIdx = 9; // standard [Events] field order

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (/^\[Events\]/i.test(trimmed)) { inEvents = true; continue; }
      if (/^\[.+\]/.test(trimmed)) { inEvents = false; continue; }
      if (!inEvents) continue;

      if (/^Format:/i.test(trimmed)) {
        const f = trimmed.slice(trimmed.indexOf(':') + 1).split(',').map((x) => x.trim().toLowerCase());
        const si = f.indexOf('start'); if (si !== -1) startIdx = si;
        const ei = f.indexOf('end'); if (ei !== -1) endIdx = ei;
        const ti = f.indexOf('text'); if (ti !== -1) textIdx = ti;
        continue;
      }
      if (!/^Dialogue:/i.test(trimmed)) continue;

      const parts = trimmed.slice(trimmed.indexOf(':') + 1).split(',');
      if (parts.length <= textIdx) continue;
      const start = this.assTime(parts[startIdx]?.trim() ?? '');
      const end = this.assTime(parts[endIdx]?.trim() ?? '');
      if (start === null || end === null) continue;
      // Text is the last field; it may legitimately contain commas → rejoin.
      const text = parts.slice(textIdx).join(',')
        .replace(/\{[^}]*\}/g, '')   // drop {\override} blocks
        .replace(/\\N|\\n/g, '\n')   // ASS hard / soft line breaks
        .trim();
      const { textEn, textZh } = this.splitBilingual(text, lineOrder);
      cues.push({ id: '', index: 0, start, end, text, textEn, textZh });
    }
    return cues;
  }

  // ─── SBV Parser (YouTube) ────────────────────────────────────────────────

  private static parseSBV(content: string, lineOrder: SubtitleLineOrder): SubtitleCue[] {
    const TIME = /(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})\s*,\s*(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})/;
    const cues: SubtitleCue[] = [];
    for (const block of content.split(/\n\n+/)) {
      const lines = block.split('\n').map((l) => l.replace(/\s+$/, ''));
      const idx = lines.findIndex((l) => TIME.test(l));
      if (idx === -1) continue;
      const m = lines[idx]!.match(TIME)!;
      const start = this.toSeconds(m[1]!, m[2]!, m[3]!, m[4]!);
      const end = this.toSeconds(m[5]!, m[6]!, m[7]!, m[8]!);
      const text = lines.slice(idx + 1).join('\n').trim();
      const { textEn, textZh } = this.splitBilingual(text, lineOrder);
      cues.push({ id: '', index: 0, start, end, text, textEn, textZh });
    }
    return cues;
  }

  /** ASS/SSA timestamp "H:MM:SS.cc" (centiseconds) → seconds. */
  private static assTime(t: string): number | null {
    const m = t.match(/(\d+):(\d{2}):(\d{2})[.:](\d{1,3})/);
    if (!m) return null;
    const frac = parseInt(m[4]!.padEnd(3, '0').slice(0, 3)) / 1000;
    return parseInt(m[1]!) * 3600 + parseInt(m[2]!) * 60 + parseInt(m[3]!) + frac;
  }

  // ─── Finalize ───────────────────────────────────────────────────────────

  /**
   * Sort cues by start time, drop degenerate (end <= start) intervals, and
   * assign positional ids/indices. Sorting is REQUIRED: useMediaSync locates
   * the active cue via binary search, which assumes monotonically increasing
   * start times — VTT allows out-of-order cues and bilingual exports often
   * overlap, so an unsorted list silently mislocates the active subtitle.
   */
  private static finalize(cues: SubtitleCue[]): SubtitleCue[] {
    return cues
      .filter((c) => c.end > c.start)
      .sort((a, b) => a.start - b.start || a.end - b.end)
      .map((c, i) => ({ ...c, id: `cue-${i}`, index: i }));
  }

  // ─── Bilingual Split ────────────────────────────────────────────────────

  // textEn = study/primary line, textZh = translation line (field names kept
  // for back-compat; see SubtitleCue).
  private static splitBilingual(
    text: string,
    lineOrder: SubtitleLineOrder,
  ): { textEn?: string; textZh?: string } {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return {};

    // Explicit order: first line vs. the remaining lines.
    if (lineOrder === 'studyFirst') {
      return { textEn: lines[0], textZh: lines.slice(1).join(' ') };
    }
    if (lineOrder === 'translationFirst') {
      return { textZh: lines[0], textEn: lines.slice(1).join(' ') };
    }

    // auto: lines in CJK script are the translation (native), the rest are the
    // study language. Works for any non-CJK study language paired with a Chinese
    // translation; for a CJK study language, set the order explicitly.
    const hasChinese = (s: string) => /[一-鿿]/.test(s);
    const zh: string[] = [];
    const en: string[] = [];
    for (const line of lines) {
      (hasChinese(line) ? zh : en).push(line);
    }
    if (zh.length > 0 && en.length > 0) {
      return { textEn: en.join(' '), textZh: zh.join(' ') };
    }
    return {};
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private static toSeconds(h: string, m: string, s: string, ms: string): number {
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
  }
}
