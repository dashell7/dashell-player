import { App, Notice, TFile, normalizePath } from 'obsidian';
import type { LangPlayerSettings, SubtitleCue, MediaSource } from '../types';
import { formatTime, formatDateYMD, formatDateYMDHM, ensureVaultFolder } from '../utils';
import { logger } from '../utils';
import { t } from '../i18n';

const MAX_NOTE_FILENAME_LEN = 200;
// Windows reserved device names — prefix with `_` so file creation never fails.
const RESERVED_NAME_RE = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;

export class NoteService {
  constructor(
    private app: App,
    private getSettings: () => LangPlayerSettings,
  ) {}

  /** Derive the note's vault path + cleaned display title for a media source. */
  private buildNotePath(source: MediaSource): { path: string; cleanTitle: string } {
    const rawName = source.displayName ?? 'Untitled';
    const cleanTitle = rawName
      .replace(/_/g, ' ')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    let fileName = cleanTitle || 'Untitled';
    if (fileName.length > MAX_NOTE_FILENAME_LEN) fileName = fileName.slice(0, MAX_NOTE_FILENAME_LEN).trim();
    if (RESERVED_NAME_RE.test(fileName)) fileName = `_${fileName}`;
    const noteRoot = normalizePath((this.getSettings().notePath || 'LangPlayer/notes').trim()).replace(/^\/+/, '');
    return { path: normalizePath(`${noteRoot}/${fileName}.md`), cleanTitle };
  }

  /** Find the study note for a source, creating it from the template if absent. */
  private async findOrCreateNote(source: MediaSource): Promise<TFile | null> {
    const { path, cleanTitle } = this.buildNotePath(source);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) return existing;
    if (existing) return null; // path occupied by a folder

    const folder = path.substring(0, path.lastIndexOf('/'));
    if (folder) await ensureVaultFolder(this.app, folder);

    const now = new Date();
    const rawTemplate = await this.loadTemplate(this.getSettings().noteTemplate, cleanTitle);
    const content = rawTemplate
      .replace(/\{\{title\}\}/g, cleanTitle)
      .replace(/\{\{date\}\}/g, formatDateYMD(now))
      .replace(/\{\{isoDate\}\}/g, now.toISOString())
      .replace(/\{\{url\}\}/g, source.url)
      .replace(/\{\{source\}\}/g, source.url);
    const created = await this.app.vault.create(path, content);
    return created instanceof TFile ? created : null;
  }

  /** Build the `[mm:ss](obsidian://langplayer?...)` deep link for a cue. */
  private buildCueLink(cue: SubtitleCue, source: MediaSource): string {
    // For local files use the vault path so the protocol link can re-resolve the
    // TFile; for remote URLs use the URL directly.
    const srcParam = source.file ? source.file.path : source.url;
    const encodedSrc = encodeURIComponent(srcParam);
    return `[${formatTime(cue.start)}](obsidian://langplayer?src=${encodedSrc}&t=${cue.start})`;
  }

  /** Format a cue as `link text` honoring the en/zh display toggles. */
  private formatCueLine(cue: SubtitleCue, source: MediaSource, showEn: boolean, showZh: boolean): string {
    const parts: string[] = [];
    if (showEn) parts.push(cue.textEn ?? cue.text);
    if (showZh && cue.textZh) parts.push(cue.textZh);
    if (parts.length === 0) parts.push(cue.textEn ?? cue.text); // always insert something
    return `${this.buildCueLink(cue, source)} ${parts.join('  ')}`;
  }

  /**
   * Save a subtitle sentence to the study note for the current media source.
   * Creates the note from the template if missing, then appends the line.
   */
  async saveToNote(
    cue: SubtitleCue,
    source: MediaSource | null,
    showEn = true,
    showZh = true,
  ): Promise<void> {
    if (!source) return;

    const line = this.formatCueLine(cue, source, showEn, showZh);

    try {
      const file = await this.findOrCreateNote(source);
      if (!file) return;
      await this.app.vault.process(file, (existing) =>
        existing.endsWith('\n')
          ? existing + line + '\n'
          : existing + '\n' + line + '\n',
      );
      new Notice(t('notice.noteSaved'));
    } catch (e) {
      logger.error('[NoteService] Failed to save to note:', e);
      new Notice(`${t('notice.noteSaveFailed')}: ${(e as Error).message}`);
    }
  }

  async openStudyNote(source: MediaSource | null): Promise<void> {
    if (!source) return;
    const file = await this.findOrCreateNote(source);
    if (file instanceof TFile) {
      // Open in a split so the player stays visible.
      const leaf = this.app.workspace.getLeaf('split');
      await leaf.openFile(file);
    }
  }

  /**
   * Import all subtitle cues into the study note for the current media source.
   * Appends a dated section with every cue formatted as a timestamp link + text.
   */
  async saveAllSubtitlesToNote(
    cues: SubtitleCue[],
    source: MediaSource | null,
    showEn = true,
    showZh = true,
  ): Promise<void> {
    if (!source || cues.length === 0) return;

    const lines: string[] = [`\n## 字幕全文 (${formatDateYMDHM()})\n`];
    for (const cue of cues) {
      lines.push(this.formatCueLine(cue, source, showEn, showZh));
    }
    lines.push('');
    const block = lines.join('\n');

    try {
      const file = await this.findOrCreateNote(source);
      if (!file) return;
      await this.app.vault.process(file, (existing) => existing + block);
      new Notice(t('notice.subtitlesImported', { n: cues.length }));
    } catch (e) {
      logger.error('[NoteService] Failed to import subtitles:', e);
      new Notice(`${t('notice.noteSaveFailed')}: ${(e as Error).message}`);
    }
  }

  /**
   * Load template content: if noteTemplate is a vault file path, read it;
   * otherwise fall back to the built-in default template.
   */
  private async loadTemplate(templatePath: string, _title: string): Promise<string> {
    if (templatePath) {
      const templateFile = this.app.vault.getAbstractFileByPath(templatePath);
      if (templateFile instanceof TFile) {
        try {
          return await this.app.vault.read(templateFile);
        } catch (err) {
          logger.error('Failed to read template file:', err);
          new Notice(`${t('notice.templateReadFailed')}: ${templatePath}`);
        }
      }
    }
    // Built-in default — frontmatter + clean structure
    return [
      '---',
      'title: "{{title}}"',
      'date: {{date}}',
      'source: "{{url}}"',
      'tags: [语言学习]',
      '---',
      '',
      '## 学习笔记',
      '',
      '',
      '',
      '## 生词',
      '',
      '| 单词 | 释义 | 例句 |',
      '| ---- | ---- | ---- |',
      '|  |  |  |',
      '',
      '## 精听句子',
      '',
      '',
      '',
      '## 总结',
      '',
      '',
      '',
    ].join('\n');
  }
}
