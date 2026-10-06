import { normalizePath, parseYaml, stringifyYaml, type App, type EventRef, type TAbstractFile, TFile, TFolder } from 'obsidian';
import type { VocabEntry, VocabStatus } from '../store/vocabularyStore';
import { ensureVaultFolder } from '../utils';

const STATUS_TO_FILE: Record<VocabStatus, string> = { unknown: '新学', learning: '熟悉', mastered: '已掌握' };
const STATUS_FROM_FILE: Record<string, VocabStatus> = { 新学: 'unknown', 熟悉: 'learning', 已掌握: 'mastered', unknown: 'unknown', learning: 'learning', mastered: 'mastered' };
const FIELD_KEYS = {word: 'expression', lemma: 'lemma', status: 'status', definition: 'meaning', translation: 'translation', context: 'sentence1', sentenceZh: 'trans1', source: 'origin1', mediaUrl: 'mediaUrl', mediaTime: 'mediaTime', tags: 'tags', createdAt: 'created', updatedAt: 'updated', reviewCount: 'reviewCount'} as const;
export interface DeletedWord { path: string; content: string }

function frontmatter(content: string): Record<string, unknown> | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) return null;
  const value: unknown = parseYaml(match[1]!);
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** File identity belongs to a file, never its timestamp. Duplicate/legacy IDs
 * receive distinct session handles without rewriting the user's notes. */
export class VocabularyDbService {
  private cache: VocabEntry[] | null = null;
  private revision = 0;
  private fileById = new Map<number, TFile>();
  private idByFile = new WeakMap<TFile, number>();
  private nextId = Date.now();
  private listeners = new Set<() => void>();
  private events: EventRef[] = [];
  constructor(private app: App, private folder = 'LangPlayer/vocabulary') {
    const changed = (file: TAbstractFile, oldPath?: string) => {
      if (this.contains(file.path) || (oldPath && this.contains(oldPath))) this.invalidate();
    };
    this.events = [app.vault.on('create', changed), app.vault.on('modify', changed), app.vault.on('delete', changed), app.vault.on('rename', changed)];
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  dispose(): void {
    this.events.forEach(ref => this.app.vault.offref(ref));
    this.events = [];
    this.listeners.clear();
  }
  private contains(path: string): boolean {
    const root = normalizePath(this.folder);
    return path === root || path.startsWith(`${root}/`);
  }
  private invalidate(): void {
    this.cache = null;
    this.revision++;
    this.listeners.forEach(listener => listener());
  }
  setFolder(folder: string): void {
    if (normalizePath(folder) === normalizePath(this.folder)) return;
    this.folder = folder;
    this.invalidate();
  }
  private identity(file: TFile, preferred?: number): number {
    const known = this.idByFile.get(file);
    if (known !== undefined) return known;
    let id = preferred;
    if (!id || !Number.isSafeInteger(id) || this.fileById.has(id)) {
      do { id = ++this.nextId; } while (this.fileById.has(id));
    }
    this.idByFile.set(file, id);
    this.fileById.set(id, file);
    return id;
  }
  async addWord(entry: Omit<VocabEntry, 'id'>): Promise<number> {
    await ensureVaultFolder(this.app, this.folder);
    const safe = entry.word.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'untitled';
    // Different expressions may sanitize to the same filename.
    for (let suffix = 0; ; suffix++) {
      const path = normalizePath(`${this.folder}/${safe}${suffix ? ` (${suffix})` : ''}.md`);
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        const parsed = this.parseContent(existing, await this.app.vault.read(existing));
        if (parsed?.word.toLowerCase() === entry.word.toLowerCase()) return parsed.id!;
        continue;
      }
      if (existing) continue;
      let id: number;
      do { id = ++this.nextId; } while (this.fileById.has(id));
      const fm: Record<string, unknown> = { id, type: 'WORD' };
      this.applyUpdates(fm, entry);
      try {
        const file = await this.app.vault.create(path, `---\n${stringifyYaml(fm)}---\n`);
        this.identity(file, id);
        this.invalidate();
        return id;
      } catch (error) {
        if (!this.app.vault.getAbstractFileByPath(path)) throw error;
        suffix--; // Reinspect a concurrent creation.
      }
    }
  }
  private applyUpdates(fm: Record<string, unknown>, updates: Partial<VocabEntry>): void {
    for (const key of Object.keys(FIELD_KEYS) as (keyof typeof FIELD_KEYS)[]) {
      if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
      const value = updates[key];
      const target = FIELD_KEYS[key];
      if (value === undefined) delete fm[target];
      else fm[target] = key === 'status' ? STATUS_TO_FILE[value as VocabStatus] : value;
      const alias = ({word: 'word', definition: 'definition', context: 'context', source: 'source'} as Record<string, string>)[key];
      if (alias && alias in fm) fm[alias] = value;
    }
    if (updates.createdAt !== undefined) fm.date = new Date(updates.createdAt).toISOString();
  }
  async updateWord(id: number, updates: Partial<VocabEntry>): Promise<void> {
    const file = await this.findFileById(id);
    await this.app.fileManager.processFrontMatter(file, fm => {
      this.applyUpdates(fm as Record<string, unknown>, {...updates, updatedAt: Date.now()});
    });
    this.invalidate();
  }
  async deleteWord(id: number): Promise<DeletedWord> {
    const file = await this.findFileById(id);
    const snapshot = {path: file.path, content: await this.app.vault.read(file)};
    await this.app.fileManager.trashFile(file);
    this.invalidate();
    return snapshot;
  }
  async restoreWord(snapshot: DeletedWord): Promise<void> {
    if (this.app.vault.getAbstractFileByPath(snapshot.path)) throw new Error('Vocabulary restore path is occupied');
    await ensureVaultFolder(this.app, snapshot.path.slice(0, snapshot.path.lastIndexOf('/')));
    await this.app.vault.create(snapshot.path, snapshot.content);
    this.invalidate();
  }
  async getAll(): Promise<VocabEntry[]> {
    if (this.cache) return this.cache;
    await ensureVaultFolder(this.app, this.folder);
    const revision = this.revision;
    const entries: VocabEntry[] = [];
    for (const file of this.getVocabFiles()) {
      const entry = this.parseContent(file, await this.app.vault.read(file));
      if (entry) entries.push(entry);
    }
    if (revision !== this.revision) return this.getAll();
    this.cache = entries;
    return entries;
  }
  async findWord(word: string): Promise<VocabEntry | undefined> {
    return (await this.getAll()).find(e => e.word.toLowerCase() === word.toLowerCase());
  }
  private getVocabFiles(): TFile[] {
    const root = this.app.vault.getAbstractFileByPath(normalizePath(this.folder));
    const files: TFile[] = [];
    const visit = (folder: TFolder) => folder.children.forEach(child => {
      if (child instanceof TFolder) visit(child);
      else if (child instanceof TFile && child.extension === 'md' && !child.basename.startsWith('_')) files.push(child);
    });
    if (root instanceof TFolder) visit(root);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  private async findFileById(id: number): Promise<TFile> {
    await this.getAll();
    const file = this.fileById.get(id);
    if (!file || !this.contains(file.path) || this.app.vault.getAbstractFileByPath(file.path) !== file) throw new Error('Vocabulary entry no longer exists');
    return file;
  }
  private parseContent(file: TFile, content: string): VocabEntry | null {
    const fm = frontmatter(content);
    if (!fm) return null;
    const get = (...keys: string[]): string => {
      const value = keys.map(key => fm[key]).find(value => typeof value === 'string' && value.length > 0);
      return typeof value === 'string' ? value : '';
    };
    const word = get('expression', 'word');
    if (!word) return null;
    const date = fm.date instanceof Date ? fm.date.getTime() : Date.parse(get('date').replace(' ', 'T'));
    const createdAt = Number(fm.created) || (Number.isFinite(date) ? date : file.stat.ctime);
    return {
      id: this.identity(file, Number(fm.id)), word, lemma: get('lemma') || word.toLowerCase(), status: STATUS_FROM_FILE[get('status')] ?? 'unknown',
      definition: get('meaning', 'definition') || undefined, translation: get('translation') || undefined, context: get('sentence1', 'context') || undefined,
      sentenceZh: get('trans1') || undefined, source: get('origin1', 'source') || undefined, mediaUrl: get('mediaUrl') || undefined,
      mediaTime: fm.mediaTime !== undefined && Number.isFinite(Number(fm.mediaTime)) ? Number(fm.mediaTime) : undefined,
      tags: Array.isArray(fm.tags) ? fm.tags.filter((v): v is string => typeof v === 'string') : get('tags').split(/[, ]+/).filter(Boolean),
      createdAt, updatedAt: Number(fm.updated) || file.stat.mtime, reviewCount: Number(fm.reviewCount) || 0,
    };
  }
  async exportCSV(): Promise<string> {
    const escape = (s: string) => /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    const lines = (await this.getAll()).map(e => [e.word, e.lemma, e.status, e.definition ?? '', e.translation ?? '', e.context ?? '', e.tags.join(','), new Date(e.createdAt).toISOString(), e.mediaUrl ?? '', String(e.mediaTime ?? '')].map(escape).join(','));
    return 'word,lemma,status,definition,translation,context,tags,created,mediaUrl,mediaTime\n' + lines.join('\n');
  }
}
