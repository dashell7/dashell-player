import { create } from 'zustand';

export type VocabStatus = 'unknown' | 'learning' | 'mastered';
export type VocabSortBy = 'word' | 'createdAt' | 'updatedAt' | 'status';

export interface VocabEntry {
  id?: number;
  word: string;
  lemma: string;
  status: VocabStatus;
  definition?: string;
  translation?: string;
  context?: string;       // sentence1 (study-language context sentence)
  sentenceZh?: string;    // trans1 (translation of sentence)
  source?: string;        // origin1 (source name)
  /** Media source (vault path or URL) the word was captured from — enables
   *  "jump back to the exact sentence" from the vocabulary table. */
  mediaUrl?: string;
  /** Playback position (seconds) of the sentence the word came from. */
  mediaTime?: number;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  reviewCount: number;
}

interface VocabularyState {
  entries: VocabEntry[];
  filter: VocabStatus | 'all';
  search: string;
  sortBy: VocabSortBy;
  sortOrder: 'asc' | 'desc';
  selectedIds: Set<number>;
  isLoading: boolean;

  setEntries: (entries: VocabEntry[]) => void;
  addEntry: (entry: VocabEntry) => void;
  updateEntry: (id: number, updates: Partial<VocabEntry>) => void;
  removeEntry: (id: number) => void;
  setFilter: (filter: VocabStatus | 'all') => void;
  setSearch: (search: string) => void;
  setSortBy: (sortBy: VocabularyState['sortBy']) => void;
  toggleSortOrder: () => void;
  toggleSelect: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialVocabularyState = {
  entries: [] as VocabEntry[],
  filter: 'all' as VocabStatus | 'all',
  search: '',
  sortBy: 'createdAt' as VocabularyState['sortBy'],
  sortOrder: 'desc' as 'asc' | 'desc',
  selectedIds: new Set<number>(),
  isLoading: false,
};

export const useVocabularyStore = create<VocabularyState>((set, get) => ({
  ...initialVocabularyState,

  setEntries: (entries) => set({ entries }),
  addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
  updateEntry: (id, updates) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e)),
    })),
  removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
  setSortBy: (sortBy) => set({ sortBy }),
  toggleSortOrder: () => set((s) => ({ sortOrder: s.sortOrder === 'asc' ? 'desc' : 'asc' })),
  toggleSelect: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      next.has(id) ? next.delete(id) : next.add(id);
      return { selectedIds: next };
    }),
  selectAll: () =>
    set((s) => ({ selectedIds: new Set(s.entries.map((e) => e.id!).filter(Boolean)) })),
  clearSelection: () => set({ selectedIds: new Set() }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ ...initialVocabularyState, selectedIds: new Set() }),
}));

// ─── Filtering / sorting ──────────────────────────────────────────────────
//
// Pure helper so the component can memoize it with stable inputs. Using it
// directly as a Zustand selector returns a fresh array every call, which both
// defeats Object.is bailout (re-renders on ANY store change) and re-sorts every
// render — so the component below calls this inside useMemo instead.
export function filterSortVocab(
  entries: VocabEntry[],
  filter: VocabStatus | 'all',
  search: string,
  sortBy: VocabularyState['sortBy'],
  sortOrder: 'asc' | 'desc',
): VocabEntry[] {
  let result = entries;
  if (filter !== 'all') result = result.filter((e) => e.status === filter);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (e) => e.word.toLowerCase().includes(q) || e.definition?.toLowerCase().includes(q),
    );
  }
  result = [...result];
  result.sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'word') cmp = a.word.localeCompare(b.word);
    else if (sortBy === 'status') cmp = a.status.localeCompare(b.status);
    else if (sortBy === 'createdAt') cmp = a.createdAt - b.createdAt;
    else cmp = a.updatedAt - b.updatedAt;
    return sortOrder === 'asc' ? cmp : -cmp;
  });
  return result;
}

// Selector kept for convenience; prefer filterSortVocab + useMemo in components.
export const selectFilteredEntries = (s: VocabularyState): VocabEntry[] =>
  filterSortVocab(s.entries, s.filter, s.search, s.sortBy, s.sortOrder);
