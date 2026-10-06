import { describe, expect, it } from 'vitest';
import { TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import { VocabularyDbService } from '../src/services/VocabularyDbService';
import type { VocabEntry } from '../src/store/vocabularyStore';

function memoryVault() {
  const folder = new TFolder(); folder.path = 'words';
  const files = new Map<string, TFile>([]);
  const content = new Map<string, string>();
  const listeners = new Map<string, Set<(file: TFile, old?: string) => void>>();
  const emit = (name: string, file: TFile, old?: string) => listeners.get(name)?.forEach(fn => fn(file, old));
  const create = async (path: string, text: string) => {
    if (files.has(path)) throw new Error('File exists');
    const file = new TFile(); file.path = path; file.extension = 'md'; file.basename = path.split('/').pop()!.slice(0, -3);
    (file as any).stat = {ctime: 1, mtime: 2};
    files.set(path, file); content.set(path, text); folder.children.push(file); emit('create', file); return file;
  };
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => path === 'words' ? folder : files.get(path),
      create, read: async (file: TFile) => content.get(file.path)!,
      on: (name: string, fn: (file: TFile) => void) => { const set = listeners.get(name) ?? new Set(); set.add(fn); listeners.set(name, set); return {name, fn}; },
      offref: ({name, fn}: any) => listeners.get(name)?.delete(fn),
    },
    fileManager: {
      processFrontMatter: async (file: TFile, updater: (fm: any) => void) => {
        const original = content.get(file.path)!;
        const match = /^---\r?\n([^]*?)\r?\n---(?:\r?\n|$)/.exec(original)!;
        const fm = parseYaml(match[1]!); updater(fm);
        content.set(file.path, `---\n${stringifyYaml(fm)}---\n` + original.slice(match[0].length)); emit('modify', file);
      },
      trashFile: async (file: TFile) => {files.delete(file.path); content.delete(file.path); folder.children = folder.children.filter(x => x !== file); emit('delete', file);},
    },
  };
  return {app: app as any, create, files, content, emit, folder};
}
const entry = (word: string): Omit<VocabEntry, 'id'> => ({word, lemma: word, definition: 'Meaning', translation: 'translation', context: 'A test.', tags: ['english'], status: 'unknown', createdAt: 1, updatedAt: 2, reviewCount: 7});

describe('vocabulary data reliability', () => {
  it('updates only requested properties and preserves body, unknown fields and extra examples', async () => {
    const v = memoryVault(); const file = await v.create('words/test.md', '---\nexpression: test\nmeaning: old\nid: 10\ncustom: {nested: true}\nsentence2: extra\n---\n\n# Personal note\nKeep this exact body.\n');
    const db = new VocabularyDbService(v.app, 'words');
    await db.updateWord(10, {definition: 'changed'});
    expect(v.content.get(file.path)).toContain('nested: true');
    expect(v.content.get(file.path)).toContain('sentence2: extra');
    expect(v.content.get(file.path)).toMatch(/\n\n# Personal note\nKeep this exact body\.\n$/);
    expect((await db.getAll())[0]!.definition).toBe('changed'); db.dispose();
  });
  it('round-trips quoted expressions, multiline text, tags and review count', async () => {
    const v = memoryVault(); const db = new VocabularyDbService(v.app, 'words');
    await db.addWord({...entry('yes: # "true"'), definition: 'Line 1\nLine 2'});
    const reloaded = new VocabularyDbService(v.app, 'words');
    expect((await reloaded.getAll())[0]).toMatchObject({word: 'yes: # "true"', definition: 'Line 1\nLine 2', translation: 'translation', tags: ['english'], reviewCount: 7});
    db.dispose(); reloaded.dispose();
  });
  it.each([false, true])('edits same-second words independently, explicit duplicate IDs=%s', async explicit => {
    const v = memoryVault();
    for (const word of ['first', 'second']) await v.create(`words/${word}.md`, `---\nexpression: ${word}\ndate: 2026-10-01 08:00:00\n${explicit ? 'id: 42\n' : ''}meaning: unchanged\n---\n`);
    const db = new VocabularyDbService(v.app, 'words'); const all = await db.getAll();
    expect(all[0]!.id).not.toBe(all[1]!.id);
    await db.updateWord(all[0]!.id!, {definition: 'changed'});
    expect((await db.getAll()).map(e => e.definition)).toEqual(['changed', 'unchanged']); db.dispose();
  });
  it('invalidates for external modify, create, rename and delete; retains the same file handle across rename', async () => {
    const v = memoryVault(); const db = new VocabularyDbService(v.app, 'words');
    const file = await v.create('words/first.md', '---\nexpression: first\nmeaning: before\n---\n');
    const id = (await db.getAll())[0]!.id;
    v.content.set(file.path, '---\nexpression: first\nmeaning: after\n---\n'); v.emit('modify', file);
    expect((await db.getAll())[0]!.definition).toBe('after');
    await v.create('words/second.md', '---\nexpression: second\n---\n'); expect(await db.getAll()).toHaveLength(2);
    v.files.delete(file.path); const old = file.path; file.path = 'words/renamed.md'; v.files.set(file.path, file); v.content.set(file.path, v.content.get(old)!); v.emit('rename', file, old);
    expect((await db.getAll()).find(e => e.word === 'first')!.id).toBe(id);
    await db.deleteWord(id!); expect(await db.getAll()).toHaveLength(1);
    await expect(db.updateWord(id!, {})).rejects.toThrow('no longer exists'); db.dispose();
  });
  it('reads CRLF, block YAML and missing/invalid statuses', async () => {
    const v = memoryVault(); await v.create('words/crlf.md', '---\r\nexpression: crlf\r\nmeaning: |\r\n  Line one\r\n  Line two\r\nstatus: invalid\r\n---\r\n');
    const db = new VocabularyDbService(v.app, 'words'); expect((await db.getAll())[0]).toMatchObject({status: 'unknown', definition: 'Line one\nLine two\n'}); db.dispose();
  });
  it('restores the entire deleted note and refuses to overwrite a replacement', async () => {
    const v = memoryVault(); const original = '---\nexpression: first\nextra: true\n---\nMy note';
    await v.create('words/first.md', original); const db = new VocabularyDbService(v.app, 'words');
    const snapshot = await db.deleteWord((await db.getAll())[0]!.id!); await db.restoreWord(snapshot);
    expect(v.content.get('words/first.md')).toBe(original); await expect(db.restoreWord(snapshot)).rejects.toThrow('occupied'); db.dispose();
  });
  it('creates distinct words whose sanitized filenames collide', async () => {
    const v = memoryVault(); const db = new VocabularyDbService(v.app, 'words');
    const ids = await Promise.all([db.addWord(entry('a/b')), db.addWord(entry('ab'))]);
    expect(new Set(ids).size).toBe(2); expect(await db.getAll()).toHaveLength(2); db.dispose();
  });
});
