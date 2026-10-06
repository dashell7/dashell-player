import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { List } from 'react-window';
import type { RowComponentProps } from 'react-window';
import { Notice } from 'obsidian';
import { useVocabularyStore, filterSortVocab, type VocabEntry, type VocabSortBy, type VocabStatus } from '../../store/vocabularyStore';
import { usePlugin, useSettings } from '../../context';
import { speakText, formatTime, logger } from '../../utils';
import { Icon } from '../shared/Icon';
import { t } from '../../i18n';

interface VocabularyTableProps {
  onEdit: (entry: VocabEntry) => void;
  onDelete: (id: number) => Promise<void>;
  onOpenMedia: () => void;
}

const STATUS_ICONS: Record<VocabStatus, string> = {
  unknown: 'circle',
  learning: 'book-open',
  mastered: 'check-circle',
};

// Mobile action buttons are 44px touch targets. Keep the virtualized row tall
// enough that those targets are never clipped by react-window.
const ROW_HEIGHT = 48;

interface VocabRowProps {
  entries: VocabEntry[];
  onEdit: (entry: VocabEntry) => void;
  onDelete: (id: number) => Promise<void>;
  onStatusChange: (entry: VocabEntry) => Promise<void>;
  onSpeakWord?: (word: string) => void;
  onJumpToSource: (entry: VocabEntry) => void;
}

// Stable row renderer for react-window v2 — data arrives via rowProps spread.
function VocabRow({ index, style, entries, onEdit, onDelete, onStatusChange, onSpeakWord, onJumpToSource }: RowComponentProps<VocabRowProps>) {
  const entry: VocabEntry | undefined = entries[index];
  if (!entry) return null;
  return (
    <div
      role="row"
      className="lp-vocab-row"
      style={style}
    >
      <span role="cell" className="lp-vocab-status-cell">
        <button
          className={`lp-btn lp-btn-icon lp-vocab-status-${entry.status}`}
          onClick={() => { void onStatusChange(entry); }}
          aria-label={t(`vocab.${entry.status}`)}
          title={t(`vocab.${entry.status}`)}
        >
          <Icon name={STATUS_ICONS[entry.status]} size={16} />
        </button>
      </span>
      <span role="cell" className="lp-vocab-word-cell">
        {onSpeakWord ? (
          <button
            type="button"
            className="lp-word-speak"
            onClick={() => onSpeakWord(entry.word)}
            title={t('vocab.pronounce')}
            aria-label={`${t('vocab.pronounce')}: ${entry.word}`}
          >
            {entry.word}
          </button>
        ) : entry.word}
      </span>
      <span role="cell" className="lp-vocab-definition-cell">
        {entry.definition || entry.translation || '—'}
      </span>
      <span role="cell" className="lp-vocab-meta-cell">
        {new Date(entry.createdAt).toLocaleDateString()}
      </span>
      <span role="cell" className="lp-vocab-meta-cell lp-ellipsis">
        {entry.mediaUrl ? (
          <button
            type="button"
            className="lp-word-speak"
            onClick={() => onJumpToSource(entry)}
            title={t('vocab.jumpToSource', { time: formatTime(entry.mediaTime ?? 0) })}
            aria-label={`${t('vocab.jumpToSource', { time: formatTime(entry.mediaTime ?? 0) })}: ${entry.word}`}
          >
            ▶ {entry.source || formatTime(entry.mediaTime ?? 0)}
          </button>
        ) : (entry.source || '—')}
      </span>
      <div role="cell" className="lp-vocab-actions-cell">
        <button className="lp-btn lp-btn-icon" onClick={() => onEdit(entry)} aria-label={t('vocab.edit')}><Icon name="edit-2" size={13} /></button>
        <button className="lp-btn lp-btn-icon lp-btn-danger" onClick={() => { if (entry.id !== undefined) void onDelete(entry.id); }} disabled={entry.id === undefined} aria-label={t('vocab.deleteAction')}><Icon name="trash-2" size={13} /></button>
      </div>
    </div>
  );
}

export function VocabularyTable({ onEdit, onDelete, onOpenMedia }: VocabularyTableProps) {
  // Subscribe to the raw atoms and derive the filtered/sorted list with useMemo,
  // so we don't re-sort every render or re-render on unrelated store changes.
  const allEntries = useVocabularyStore((s) => s.entries);
  const filter = useVocabularyStore((s) => s.filter);
  const search = useVocabularyStore((s) => s.search);
  const sortBy = useVocabularyStore((s) => s.sortBy);
  const sortOrder = useVocabularyStore((s) => s.sortOrder);
  const plugin = usePlugin();

  const entries = useMemo(
    () => filterSortVocab(allEntries, filter, search, sortBy, sortOrder),
    [allEntries, filter, search, sortBy, sortOrder],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(400);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((obsEntries) => {
      for (const e of obsEntries) setHeight(e.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSort = useCallback((col: typeof sortBy) => {
    if (sortBy === col) {
      useVocabularyStore.getState().toggleSortOrder();
    } else {
      useVocabularyStore.getState().setSortBy(col);
    }
  }, [sortBy]);

  const handleStatusChange = useCallback(async (entry: VocabEntry) => {
    if (entry.id === undefined) return;
    const next: VocabStatus = entry.status === 'unknown' ? 'learning' : entry.status === 'learning' ? 'mastered' : 'unknown';
    try {
      await plugin.vocabDb.updateWord(entry.id, { status: next });
      useVocabularyStore.getState().updateEntry(entry.id, { status: next });
    } catch (error) {
      logger.error('Vocabulary status update failed:', error);
      new Notice(`Dashell Player: ${t('notice.vocabUpdateFailed')}`);
    }
  }, [plugin]);

  // Jump back to the exact sentence the word was captured from.
  const handleJumpToSource = useCallback((entry: VocabEntry) => {
    if (!entry.mediaUrl) return;
    void plugin.openMediaAt(entry.mediaUrl, entry.mediaTime);
  }, [plugin]);

  // Click the word to hear it in the study language via the system Web Speech voice.
  const settings = useSettings();
  const enableWordAudio = settings.enableWordAudio;
  const targetLanguage = settings.targetLanguage;
  const handleSpeakWord = useCallback(
    (word: string) => speakText(word, targetLanguage),
    [targetLanguage],
  );

  const rowProps = useMemo(
    () => ({
      entries,
      onEdit,
      onDelete,
      onStatusChange: handleStatusChange,
      onSpeakWord: enableWordAudio ? handleSpeakWord : undefined,
      onJumpToSource: handleJumpToSource,
    }),
    [entries, onEdit, onDelete, handleStatusChange, enableWordAudio, handleSpeakWord, handleJumpToSource],
  );

  return (
    <div className="lp-vocab-table-shell">
      {/* Filters */}
      <div className="lp-vocab-filters">
        <input
          type="text"
          className="lp-input lp-vocab-search"
          value={search}
          onChange={(e) => useVocabularyStore.getState().setSearch(e.target.value)}
          placeholder={t('vocab.search')}
          aria-label={t('vocab.search')}
        />
        {(['all', 'unknown', 'learning', 'mastered'] as const).map((f) => (
          <button
            key={f}
            className={`lp-btn lp-vocab-filter-btn ${filter === f ? 'lp-btn-primary' : ''}`}
            onClick={() => useVocabularyStore.getState().setFilter(f)}
          >
            {f === 'all'
              ? t('vocab.all')
              : <><Icon name={STATUS_ICONS[f]} size={12} /> {t(`vocab.${f}`)}</>}
          </button>
        ))}
        <span className="lp-vocab-count">
          {entries.length} {t('vocab.words')}
        </span>
      </div>

      {/* Table (header + virtualized body). display:contents keeps the ARIA
          table/row nesting without disturbing the flex layout. */}
      <div role="table" aria-label={t('vocab.words')} aria-rowcount={entries.length} className="lp-display-contents">
        {/* Table header */}
        <div role="row" className="lp-vocab-header">
          <span role="columnheader">{t('vocab.status')}</span>
      <SortHeader label={t('vocab.word')} field="word" current={sortBy} order={sortOrder} onClick={handleSort} />
          <span role="columnheader">{t('vocab.definition')}</span>
          <SortHeader label={t('vocab.created')} field="createdAt" current={sortBy} order={sortOrder} onClick={handleSort} />
          <span role="columnheader">{t('vocab.source')}</span>
          <span role="columnheader">{t('vocab.actions')}</span>
        </div>

        {/* Table body (virtualized) */}
        <div ref={containerRef} className="lp-virtual-list">
          {entries.length === 0 ? (
            <div className="lp-vocab-empty lp-vocab-empty--guided">
              <Icon name="book-open" size={28} />
              <strong>{t('vocab.empty')}</strong>
              <span>{t('vocab.emptyHint')}</span>
              <button className="lp-btn lp-btn-primary" onClick={onOpenMedia}>
                <Icon name="folder-open" size={14} /> {t('empty.openMedia')}
              </button>
            </div>
          ) : (
            <List
              defaultHeight={height}
              rowCount={entries.length}
              rowHeight={ROW_HEIGHT}
              overscanCount={8}
              rowComponent={VocabRow}
              rowProps={rowProps}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SortHeader({ label, field, current, order, onClick }: {
  label: string; field: VocabSortBy; current: VocabSortBy; order: 'asc' | 'desc'; onClick: (f: VocabSortBy) => void;
}) {
  const active = current === field;
  const ariaSort: 'ascending' | 'descending' | 'none' = active ? (order === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <span role="columnheader" aria-sort={ariaSort}>
      <button type="button" className="lp-sort-header" onClick={() => onClick(field)}>
        {label} {active ? (order === 'asc' ? '↑' : '↓') : ''}
      </button>
    </span>
  );
}
