import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { FlashcardService } from '../src/services/FlashcardService';
import type { VocabEntry } from '../src/store/vocabularyStore';

function entry(definition: string): VocabEntry {
  return {
    id: 1,
    word: 'focus',
    lemma: 'focus',
    status: 'learning',
    definition,
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    reviewCount: 0,
  };
}

describe('FlashcardService', () => {
  it('replaces an existing HTML-format card without appending duplicates', async () => {
    const file = new TFile();
    file.path = 'review.md';
    let content = [
      '#flashcards',
      '',
      '#word',
      '#### <span class="lp-sr-word" data-word="focus">focus 🔊</span>',
      '?',
      'old definition',
      '',
      '#word',
      '#### <span class="lp-sr-word" data-word="other">other 🔊</span>',
      '?',
      'other definition',
      '',
    ].join('\n');
    const app = {
      vault: {
        getAbstractFileByPath: () => file,
        process: async (_file: TFile, updater: (text: string) => string) => {
          content = updater(content);
        },
      },
    };
    const service = new FlashcardService(
      app as any,
      () => ({ flashcardTag: '#flashcards' } as any),
      () => file.path,
    );

    await service.addWordToReviewDb(entry('new definition'));

    expect(content.match(/data-word="focus"/g)).toHaveLength(1);
    expect(content).toContain('new definition');
    expect(content).not.toContain('old definition');
    expect(content).toContain('data-word="other"');
  });
});
