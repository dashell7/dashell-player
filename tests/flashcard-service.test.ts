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
  function database(initial: string) {
    const file = new TFile(); file.path = 'review.md';
    let content = initial;
    const service = new FlashcardService({vault: {
      getAbstractFileByPath: () => file,
      process: async (_file: TFile, update: (text: string) => string) => {content = update(content);},
    }} as any, () => ({flashcardTag: '#flashcards', wordDatabase: file.path, reviewDatabase: file.path} as any));
    return {service, read: () => content, write: (text: string) => {content = text;}};
  }
  it('preserves outside notes and other plugins cards on repeated synchronization', async () => {
    const db = database('Personal notes\n\n#word\n#### other-plugin\n?\nOther answer\n<!--SR:!2026-10-02,3,250-->\n');
    await db.service.refreshReviewDb([entry('meaning')]);
    await db.service.refreshReviewDb([entry('changed')]);
    expect(db.read()).toContain('Personal notes'); expect(db.read()).toContain('Other answer');
    expect(db.read().match(/data-word="focus"/g)).toHaveLength(1);
    expect(db.read()).toContain('changed');
  });
  it('keeps SR scheduling on the right HTML-escaped card without crossing into the previous card', async () => {
    const db = database(''); const alpha = {...entry('a'), word: 'alpha'}; const rock = {...entry('r'), word: 'rock & roll'};
    await db.service.refreshReviewDb([alpha, rock]);
    db.write(db.read().replace('<!-- langplayer:review:end -->', '<!--SR:!2026-10-02,3,250-->\n<!-- langplayer:review:end -->'));
    await db.service.refreshReviewDb([alpha, rock]);
    const blocks = db.read().split('#word');
    expect(blocks.find(x => x.includes('data-word="alpha"'))).not.toContain('<!--SR:');
    expect(blocks.find(x => x.includes('data-word="rock &amp; roll"'))).toContain('<!--SR:!2026-10-02,3,250-->');
  });
  it('preserves legacy plain cards and their schedules without creating a duplicate owned card', async () => {
    const db = database('#word\n#### focus\n?\nUser definition\n<!--SR:!2026-10-02,3,250-->\n');
    await db.service.refreshReviewDb([entry('new')]);
    expect(db.read()).toContain('User definition'); expect(db.read()).toContain('<!--SR:');
    expect(db.read()).not.toContain('data-word="focus"');
  });
  it('updates only the managed word section and rejects damaged ownership markers', async () => {
    const db = database('My notes\n');
    await db.service.refreshWordDb([entry('old')]); await db.service.refreshWordDb([entry('new')]);
    expect(db.read()).toContain('My notes'); expect(db.read()).not.toContain('old');
    db.write('My notes\n<!-- langplayer:words:start -->\nBroken region');
    await expect(db.service.refreshWordDb([entry('new')])).rejects.toThrow('Invalid');
    expect(db.read()).toContain('Broken region');
  });
  it('propagates missing destinations and disk failures', async () => {
    const missing = new FlashcardService({vault: {getAbstractFileByPath: () => null}} as any, () => ({reviewDatabase: 'missing', wordDatabase: 'missing'} as any));
    await expect(missing.refreshReviewDb([entry('test')])).rejects.toThrow('does not exist');
    await expect(missing.refreshWordDb([entry('test')])).rejects.toThrow('does not exist');
    const broken = new FlashcardService({vault: {getAbstractFileByPath: () => new TFile(), process: async () => {throw new Error('disk full');}}} as any, () => ({reviewDatabase: 'review.md'} as any));
    await expect(broken.refreshReviewDb([entry('test')])).rejects.toThrow('disk full');
  });
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
