import { App, Notice, TFile } from 'obsidian';

interface AppWithPluginManager extends App {
  plugins?: {
    enabledPlugins?: Set<string>;
    plugins?: Record<string, unknown>;
  };
}

interface AppWithCommands extends App {
  commands?: { executeCommandById(id: string): void };
}
import type { VocabEntry } from '../store/vocabularyStore';
import type { LangPlayerSettings } from '../types';
import { logger, speakText } from '../utils';
import { t } from '../i18n';

/**
 * Play word pronunciation through the Web Speech API. LangPlayer makes no
 * direct network request, although an OS/browser voice may use an online
 * service. `lang` is a BCP-47 code (the study/target language).
 * Used internally and as the global click handler for SR cards.
 */
export function playWordAudio(word: string, lang = 'en'): void {
  speakText(word, lang);
}

/** Status labels matching Language Learner format */
const STATUS_LABELS = ['忽略', '新学', '熟悉', '已掌握'];

/** Map VocabStatus → numeric index for grouping */
const STATUS_INDEX: Record<string, number> = {
  unknown: 1,  // 新学
  learning: 2, // 熟悉
  mastered: 3, // 已掌握
};

/**
 * FlashcardService — manages two database files:
 *
 * 1. **word_database** (单词库): single .md with all words grouped by status
 *    Format: `#### 新学\nword,    meaning\n...`
 *
 * 2. **review_database** (复习库): single .md with `#flashcards` tag + SR format
 *    Format: `#word\n#### word\n?\nmeaning\n**Sentences**:\n*sentence*\ntranslation\n`
 */
/** Escape user-supplied text before writing into a markdown file that the
 *  Spaced-Repetition plugin will render as HTML in flashcards. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class FlashcardService {
  private refreshTimer: number | null = null;
  private refreshRunning = false;
  private queuedEntries: VocabEntry[] | null = null;
  private disposed = false;

  /**
   * @param getSettings — used for flashcardTag, autoRefreshDb
   * @param getReviewDbPath — resolves to effective review DB (Language Learner override or own setting)
   * @param getWordDbPath — resolves to effective word DB (Language Learner override or own setting)
   */
  constructor(
    private app: App,
    private getSettings: () => LangPlayerSettings,
    private getReviewDbPath: () => string = () => getSettings().reviewDatabase,
    private getWordDbPath: () => string = () => getSettings().wordDatabase,
  ) {}

  // ─── Review Database (复习库) ─────────────────────────────────────────

  /**
   * Refresh the review database with all vocabulary entries.
   * Preserves existing SR scheduling comments (<!--SR:...-->).
   */
  async refreshReviewDb(entries: VocabEntry[]): Promise<void> {
    const settings = this.getSettings();
    const reviewPath = this.getReviewDbPath();
    if (!reviewPath) return;

    try {
      const file = this.app.vault.getAbstractFileByPath(reviewPath);
      if (!file || !(file instanceof TFile)) {
        logger.warn('[FlashcardService] Invalid review database path:', reviewPath);
        return;
      }

      await this.app.vault.process(file, (existingText) => {
        const oldRecords = this.parseSRComments(existingText);
        const tag = settings.flashcardTag || '#flashcards';
        const cards = entries
          .filter((e) => e.definition || e.translation)
          .sort((a, b) => a.word.localeCompare(b.word))
          .map((e) => this.formatReviewCard(e, oldRecords[e.word]))
          .join('\n');
        return `${tag}\n\n${cards}`;
      });
    } catch (error) {
      logger.error('[FlashcardService] refreshReviewDb failed:', error);
    }
  }

  /**
   * Add/update a single word in the review database.
   */
  async addWordToReviewDb(entry: VocabEntry): Promise<void> {
    const settings = this.getSettings();
    const reviewPath = this.getReviewDbPath();
    if (!reviewPath) return;

    try {
      let file = this.app.vault.getAbstractFileByPath(reviewPath);
      if (!file || !(file instanceof TFile)) {
        logger.warn('[FlashcardService] Invalid review database path:', reviewPath);
        return;
      }

      const tag = settings.flashcardTag || '#flashcards';
      await this.app.vault.process(file, (content) => {
        const oldRecords = this.parseSRComments(content);
        const newCard = this.formatReviewCard(entry, oldRecords[entry.word]);
        const firstCard = content.search(/^#word\n/m);
        const preamble = firstCard >= 0 ? content.slice(0, firstCard) : content;
        const blocks = firstCard >= 0
          ? content.slice(firstCard).split(/(?=^#word\n)/m)
          : [];
        const safeWord = escapeHtml(entry.word);
        const htmlMarker = `data-word="${safeWord}"`;
        const legacyHeading = `#### ${entry.word}\n`;
        let replaced = false;
        const nextBlocks = blocks.flatMap((block) => {
          const matches = block.includes(htmlMarker) || block.includes(legacyHeading);
          if (!matches) return [block];
          if (replaced) return [];
          replaced = true;
          return [newCard];
        });

        if (!replaced) nextBlocks.push(newCard);
        const prefix = preamble.trim() ? preamble.trimEnd() + '\n\n' : `${tag}\n\n`;
        return prefix + nextBlocks.join('\n').trimStart();
      });
    } catch (error) {
      logger.error('[FlashcardService] addWordToReviewDb failed:', error);
    }
  }

  // ─── Word Database (单词库) ───────────────────────────────────────────

  /**
   * Refresh the word database with all vocabulary entries grouped by status.
   * Format matches Language Learner:
   *   #### 新学
   *   word,    meaning
   *   #### 熟悉
   *   ...
   *   #### 反向查询
   *   meaning,  word
   */
  async refreshWordDb(entries: VocabEntry[]): Promise<void> {
    const wordPath = this.getWordDbPath();
    if (!wordPath) return;

    try {
      const file = this.app.vault.getAbstractFileByPath(wordPath);
      if (!file || !(file instanceof TFile)) {
        logger.warn('[FlashcardService] Invalid word database path:', wordPath);
        return;
      }

      // Group by status
      const groups: VocabEntry[][] = [[], [], [], []]; // 忽略, 新学, 熟悉, 已掌握
      entries.forEach((e) => {
        const idx = STATUS_INDEX[e.status] ?? 1;
        if (groups[idx]) groups[idx].push(e);
      });

      const del = ',';
      // Forward lookup (word → meaning), skip "忽略" group
      const sections = groups
        .slice(1) // skip 忽略
        .map((group, i) => {
          const statusLabel = STATUS_LABELS[i + 1];
          const lines = group.map((e) => `${e.word}${del}    ${e.definition || ''}`).join('\n');
          return `#### ${statusLabel}\n${lines}\n`;
        })
        .join('\n');

      // Reverse lookup (meaning → word)
      const allWords = entries
        .map((e) => `${e.definition || ''}  ${del}  ${e.word}`)
        .join('\n');

      const text = sections + '\n#### 反向查询\n' + allWords;
      await this.app.vault.process(file, () => text);
    } catch (error) {
      logger.error('[FlashcardService] refreshWordDb failed:', error);
    }
  }

  // ─── Combined Refresh ─────────────────────────────────────────────────

  /**
   * Schedule a debounced refresh of both databases.
   * Call this after adding/modifying words.
   */
  scheduleRefresh(entries: VocabEntry[], delay = 500): void {
    const settings = this.getSettings();
    if (!settings.autoRefreshDb || this.disposed) return;

    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.runRefresh(entries).catch((error: unknown) => {
        logger.error('[FlashcardService] Scheduled database refresh failed:', error);
      });
    }, delay);
  }

  private async runRefresh(entries: VocabEntry[]): Promise<void> {
    if (this.disposed) return;
    if (this.refreshRunning) {
      this.queuedEntries = entries;
      return;
    }
    this.refreshRunning = true;
    let nextEntries: VocabEntry[] | null = entries;
    try {
      while (nextEntries && !this.disposed) {
        const currentEntries = nextEntries;
        nextEntries = null;
        await Promise.all([
          this.refreshWordDb(currentEntries),
          this.refreshReviewDb(currentEntries),
        ]);
        nextEntries = this.queuedEntries;
        this.queuedEntries = null;
      }
    } finally {
      this.refreshRunning = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queuedEntries = null;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ─── SR Plugin Integration ────────────────────────────────────────────

  startReview(): void {
    const plugins = (this.app as AppWithPluginManager).plugins;
    const enabled = plugins?.enabledPlugins?.has('obsidian-spaced-repetition')
      || Boolean(plugins?.plugins?.['obsidian-spaced-repetition']);
    if (!enabled) {
      new Notice(t('notice.spacedRepetitionMissing'));
      return;
    }
    const cmd = (this.app as unknown as AppWithCommands).commands;
    if (cmd?.executeCommandById) {
      cmd.executeCommandById('obsidian-spaced-repetition:srs-review-flashcards');
    } else {
      new Notice(t('notice.spacedRepetitionMissing'));
      logger.warn('Spaced Repetition command is unavailable');
    }
  }

  startCram(): void {
    const plugins = (this.app as AppWithPluginManager).plugins;
    const enabled = plugins?.enabledPlugins?.has('obsidian-spaced-repetition')
      || Boolean(plugins?.plugins?.['obsidian-spaced-repetition']);
    if (!enabled) {
      new Notice(t('notice.spacedRepetitionMissing'));
      return;
    }
    const cmd = (this.app as unknown as AppWithCommands).commands;
    if (cmd?.executeCommandById) {
      cmd.executeCommandById('obsidian-spaced-repetition:srs-cram-flashcards');
    } else {
      new Notice(t('notice.spacedRepetitionMissing'));
      logger.warn('Spaced Repetition command is unavailable');
    }
  }

  // ─── Format Helpers ───────────────────────────────────────────────────

  /**
   * Format a single review card in Language Learner format:
   *
   * ```
   * #word
   * #### expression
   * ?
   * meaning
   * **Sentences**:
   * *original sentence*
   * translation
   * source
   * <!--SR:...-->  (preserved from previous reviews)
   * ```
   */
  private formatReviewCard(entry: VocabEntry, srComment?: string): string {
    const safeWord = escapeHtml(entry.word);
    const word = `<span class="lp-sr-word" data-word="${safeWord}">${safeWord} 🔊</span>`;
    // Escape definition/context/translation: rendered inside SR markdown that
    // the Spaced-Repetition plugin can present as HTML in cards. Untrusted
    // dictionary content could otherwise inject script-loading tags.
    const meaning = escapeHtml(entry.definition || entry.translation || '');
    const parts: string[] = [
      '#word',
      `#### ${word}`,
      '?',
      meaning,
    ];

    // Add sentences if available
    if (entry.context) {
      parts.push('**Sentences**:');
      parts.push(`*${escapeHtml(entry.context.trim())}*`);
      if (entry.sentenceZh) parts.push(escapeHtml(entry.sentenceZh.trim()));
      if (entry.source) parts.push(escapeHtml(entry.source.trim()));
    }

    // Preserve SR scheduling comment
    if (srComment) parts.push(srComment);

    return parts.join('\n') + '\n';
  }

  /**
   * Parse existing SR scheduling comments from review database content.
   * Returns map of word → SR comment.
   */
  private parseSRComments(text: string): Record<string, string> {
    const records: Record<string, string> = {};
    const regex = /#word[\s\S]*?(<!--SR.*?-->)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const wordMatch = /#### (.+?)[\s\S]+(<!--SR.*-->)/.exec(match[0]);
      if (wordMatch && wordMatch[1] && wordMatch[2]) {
        // Strip HTML tags to get plain word
        const plainWord = wordMatch[1].replace(/<[^>]+>/g, '').replace(/🔊/g, '').trim();
        records[plainWord] = wordMatch[2];
      }
    }
    return records;
  }

}
