import { normalizePath, type App, TFile, TFolder } from 'obsidian';
import type { VocabEntry, VocabStatus } from '../store/vocabularyStore';
import { logger, ensureVaultFolder } from '../utils';

/**
 * Markdown-file-based vocabulary storage.
 *
 * Each word is stored as `<word>.md` under the configured vocab folder.
 * File format matches the Language Learner plugin:
 *
 * ```markdown
 * ---
 * expression: accent
 * meaning: 口音
 * date: 2026-02-03 10:37:17
 * status: 新学
 * type: WORD
 * sentence1: I've been watching several British TV shows recently...
 * trans1: 我最近看了几部英国电视节目...
 * origin1: LindseyLingo - YouTube
 * ---
 * ```
 */

// Status mapping: internal ↔ file format
const STATUS_TO_FILE: Record<VocabStatus, string> = {
  unknown: '新学',
  learning: '熟悉',
  mastered: '已掌握',
};
const STATUS_FROM_FILE: Record<string, VocabStatus> = {
  '新学': 'unknown',
  '熟悉': 'learning',
  '已掌握': 'mastered',
};

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseDate(s: string): number {
  const d = new Date(s.replace(' ', 'T'));
  return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

export class VocabularyDbService {
  private app: App;
  private folder: string;
  private cache: VocabEntry[] | null = null;
  private fileById = new Map<number, TFile>();

  constructor(app: App, folder = 'LangPlayer/vocabulary') {
    this.app = app;
    this.folder = folder;
  }

  setFolder(folder: string): void {
    this.folder = folder;
    this.cache = null;
    this.fileById.clear();
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────

  async addWord(entry: Omit<VocabEntry, 'id'>): Promise<number> {
    await this.ensureFolder();
    const id = Date.now();
    const fileName = this.wordToFileName(entry.word);
    const filePath = normalizePath(`${this.folder}/${fileName}`);

    // If file already exists, skip (word already in vocab)
    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      const parsed = await this.parseFile(existing);
      return parsed?.id ?? parsed?.createdAt ?? id;
    }
    if (existing) {
      return id;
    }

    const content = this.entryToMarkdown({ ...entry, id });
    try {
      const created = await this.app.vault.create(filePath, content);
      this.fileById.set(id, created);
    } catch (e) {
      // Handle TOCTOU race: if a concurrent call already created the file
      // between our check and create, treat it as "already exists" and skip.
      if (this.app.vault.getAbstractFileByPath(filePath)) {
        const raced = this.app.vault.getAbstractFileByPath(filePath);
        if (raced instanceof TFile) {
          const parsed = await this.parseFile(raced);
          return parsed?.id ?? parsed?.createdAt ?? id;
        }
        return id;
      }
      throw e;
    }
    this.cache = null;
    return id;
  }

  async updateWord(id: number, updates: Partial<VocabEntry>): Promise<void> {
    const file = await this.findFileById(id);
    if (!file) return;
    await this.app.vault.process(file, (content) => {
      const existing = this.parseContent(file, content);
      if (!existing) return content;
      const merged = { ...existing, ...updates, updatedAt: Date.now() };
      return this.entryToMarkdown(merged);
    });
    this.cache = null;
  }

  async deleteWord(id: number): Promise<void> {
    const file = await this.findFileById(id);
    if (file) {
      await this.app.fileManager.trashFile(file);
      this.cache = null;
      for (const [cachedId, cachedFile] of this.fileById) {
        if (cachedFile === file) this.fileById.delete(cachedId);
      }
    }
  }

  async getAll(): Promise<VocabEntry[]> {
    if (this.cache) return this.cache;
    await this.ensureFolder();
    const files = this.getVocabFiles();
    const entries: VocabEntry[] = [];
    this.fileById.clear();
    for (const file of files) {
      const entry = await this.parseFile(file);
      if (entry) {
        entries.push(entry);
        if (entry.id !== undefined) this.fileById.set(entry.id, file);
        this.fileById.set(entry.createdAt, file);
      }
    }
    this.cache = entries;
    return entries;
  }

  async findWord(word: string): Promise<VocabEntry | undefined> {
    const all = await this.getAll();
    const lower = word.toLowerCase();
    return all.find((e) => e.word.toLowerCase() === lower);
  }

  // ─── Export ──────────────────────────────────────────────────────────

  async exportCSV(): Promise<string> {
    const all = await this.getAll();
    const header = 'word,lemma,status,definition,translation,context,tags,created,mediaUrl,mediaTime\n';
    const lines = all.map((e) =>
      [
        this.csvEscape(e.word),
        this.csvEscape(e.lemma),
        e.status,
        this.csvEscape(e.definition ?? ''),
        this.csvEscape(e.translation ?? ''),
        this.csvEscape(e.context ?? ''),
        this.csvEscape(e.tags.join(',')),
        new Date(e.createdAt).toISOString(),
        this.csvEscape(e.mediaUrl ?? ''),
        e.mediaTime !== undefined ? String(e.mediaTime) : '',
      ].join(','),
    );
    return header + lines.join('\n');
  }

  // ─── Private: File I/O ────────────────────────────────────────────────

  private async ensureFolder(): Promise<void> {
    await ensureVaultFolder(this.app, this.folder);
  }

  private getVocabFiles(): TFile[] {
    const folderPath = normalizePath(this.folder);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return [];
    const files: TFile[] = [];
    const visit = (current: TFolder) => {
      for (const child of current.children) {
        if (child instanceof TFolder) {
          visit(child);
        } else if (child instanceof TFile && child.extension === 'md' && !child.basename.startsWith('_')) {
          files.push(child);
        }
      }
    };
    visit(folder);
    return files;
  }

  private async findFileById(id: number): Promise<TFile | null> {
    const cached = this.fileById.get(id);
    if (cached) return cached;
    const files = this.getVocabFiles();
    for (const file of files) {
      const entry = await this.parseFile(file);
      if (!entry) continue;
      if (entry.id !== undefined) this.fileById.set(entry.id, file);
      this.fileById.set(entry.createdAt, file);
      if (entry.id === id || entry.createdAt === id) return file;
    }
    return null;
  }

  private async parseFile(file: TFile): Promise<VocabEntry | null> {
    try {
      const content = await this.app.vault.cachedRead(file);
      return this.parseContent(file, content);
    } catch (e) {
      logger.warn('[VocabDb] Failed to parse:', file.path, e);
      return null;
    }
  }

  private parseContent(file: TFile, content: string): VocabEntry | null {
    try {
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) return null;

      const fm = fmMatch[1]!;

      const get = (key: string): string => {
        const m = fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'));
        if (!m) return '';
        let val = m[1]!.trim();
        // Remove surrounding quotes
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          // Handle escaped quotes inside
          val = val.slice(1, -1).replace(/''/g, "'");
        }
        return val;
      };

      // Support both Language Learner format and legacy LangPlayer/LangFlow formats
      const expression = get('expression') || get('word');
      if (!expression) return null;

      const statusRaw = get('status');
      const status: VocabStatus = STATUS_FROM_FILE[statusRaw] ?? (statusRaw as VocabStatus) ?? 'unknown';

      const dateStr = get('date');
      const createdTs = dateStr ? parseDate(dateStr) : (parseInt(get('created')) || file.stat.ctime);

      return {
        id: parseInt(get('id')) || createdTs,
        word: expression,
        lemma: get('lemma') || expression.toLowerCase(),
        status,
        definition: get('meaning') || get('definition') || undefined,
        translation: get('translation') || undefined,
        context: get('sentence1') || get('context') || undefined,
        sentenceZh: get('trans1') || undefined,
        source: get('origin1') || get('source') || undefined,
        mediaUrl: get('mediaUrl') || undefined,
        mediaTime: Number.isFinite(parseFloat(get('mediaTime'))) ? parseFloat(get('mediaTime')) : undefined,
        tags: [],
        createdAt: createdTs,
        updatedAt: parseInt(get('updated')) || file.stat.mtime,
        reviewCount: parseInt(get('reviewCount')) || 0,
      };
    } catch (e) {
      logger.warn('[VocabDb] Failed to parse:', file.path, e);
      return null;
    }
  }

  private entryToMarkdown(entry: VocabEntry | (Omit<VocabEntry, 'id'> & { id?: number })): string {
    const lines = [
      '---',
      `expression: ${entry.word}`,
      `meaning: ${this.yamlEscape(entry.definition ?? '')}`,
      `date: ${formatDate(entry.createdAt)}`,
      `status: ${STATUS_TO_FILE[entry.status] ?? '新学'}`,
      `type: WORD`,
    ];

    if (entry.context) lines.push(`sentence1: ${this.yamlEscape(entry.context)}`);
    if (entry.sentenceZh) lines.push(`trans1: ${this.yamlEscape(entry.sentenceZh)}`);
    if (entry.source) lines.push(`origin1: ${this.yamlEscape(entry.source)}`);
    // Media back-link (LangPlayer extension; harmless extra keys for LL)
    if (entry.mediaUrl) lines.push(`mediaUrl: ${this.yamlEscape(entry.mediaUrl)}`);
    if (entry.mediaTime !== undefined) lines.push(`mediaTime: ${Math.round(entry.mediaTime * 100) / 100}`);

    // Keep internal fields for round-tripping
    if (entry.id) lines.push(`id: ${entry.id}`);
    lines.push(`lemma: ${entry.lemma || entry.word.toLowerCase()}`);

    lines.push('---');
    return lines.join('\n') + '\n';
  }

  private wordToFileName(word: string): string {
    // File name = word itself, sanitized for filesystem
    const safe = word
      .replace(/[<>:"/\\|?*]/g, '')  // Remove invalid file chars
      .replace(/\s+/g, ' ')          // Normalize spaces
      .trim()
      .slice(0, 60);
    return `${safe || 'untitled'}.md`;
  }

  private yamlEscape(s: string): string {
    if (!s) return "''";
    if (s.includes(':') || s.includes('#') || s.includes("'") || s.includes('"') || s.includes('\n') || s.includes(',')) {
      return `'${s.replace(/'/g, "''").replace(/\n/g, ' ')}'`;
    }
    return s;
  }

  private csvEscape(s: string): string {
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
}
