import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Notice } from 'obsidian';
import { VocabularyTable } from './VocabularyTable';
import { VocabularyStats } from './VocabularyStats';
import { Icon } from '../shared/Icon';
import { useVocabularyStore, type VocabEntry } from '../../store/vocabularyStore';
import { usePlugin } from '../../context';
import { logger } from '../../utils';
import { t } from '../../i18n';
import type { DeletedWord } from '../../services/VocabularyDbService';

export function VocabularyPanel() {
  const plugin = usePlugin();
  const vocabDb = plugin.vocabDb;
  const flashcardService = plugin.flashcardService;
  const [showStats, setShowStats] = useState(false);
  const [editingEntry, setEditingEntry] = useState<VocabEntry | null>(null);
  const [busy, setBusy] = useState<'generate' | 'export' | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadGeneration = useRef(0);
  const isLoading = useVocabularyStore((s) => s.isLoading);

  const loadVocabulary = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoadError(false);
    useVocabularyStore.getState().setLoading(true);
    try {
      const entries = await vocabDb.getAll();
      if (generation !== loadGeneration.current) return;
      useVocabularyStore.getState().setEntries(entries);
    } catch (e) {
      if (generation !== loadGeneration.current) return;
      logger.error('Failed to load vocabulary:', e);
      setLoadError(true);
    } finally {
      if (generation === loadGeneration.current) {
        useVocabularyStore.getState().setLoading(false);
      }
    }
  }, [vocabDb]);

  useEffect(() => {
    void loadVocabulary();
    return () => { loadGeneration.current++; };
  }, [loadVocabulary]);

  const handleEdit = useCallback((entry: VocabEntry) => {
    setEditingEntry(entry);
  }, []);

  const handleSaveEdit = useCallback(async (entry: VocabEntry) => {
    if (entry.id) {
      try {
        await vocabDb.updateWord(entry.id, entry);
        // Update the store only after the disk write succeeds, so UI and disk
        // never diverge on failure.
        useVocabularyStore.getState().updateEntry(entry.id, entry);
      } catch (e) {
        logger.error('updateWord failed:', e);
        new Notice(`Dashell Player: ${t('notice.vocabUpdateFailed')}`);
        return;
      }
    }
    setEditingEntry(null);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    const entry = useVocabularyStore.getState().entries.find((e) => e.id === id);
    if (!entry) return;
    let deleted: DeletedWord;
    try {
      deleted = await vocabDb.deleteWord(id);
      useVocabularyStore.getState().removeEntry(id);
    } catch (e) {
      logger.error('deleteWord failed:', e);
      new Notice(`Dashell Player: ${t('notice.vocabDeleteFailed')}`);
      return;
    }
    // Deletion is permanent on disk, so offer a quick undo (re-creates the word).
    const frag = createFragment();
    frag.appendChild(document.createTextNode(`${t('notice.vocabDeleted', { word: entry.word })} `));
    const undoEl = createEl('a', {
      text: t('common.undo'),
      cls: 'lp-notice-undo',
    });
    let notice: Notice | null = null;
    undoEl.addEventListener('click', () => {
      notice?.hide();
      void (async () => {
        try {
          await vocabDb.restoreWord(deleted);
          useVocabularyStore.getState().setEntries(await vocabDb.getAll());
        } catch (e) {
          logger.error('undo delete failed:', e);
          new Notice(`Dashell Player: ${t('notice.vocabDeleteFailed')}`);
        }
      })();
    });
    frag.appendChild(undoEl);
    notice = new Notice(frag, 8000);
  }, []);

  const handleExportCSV = useCallback(async () => {
    setBusy('export');
    try {
      const csv = await vocabDb.exportCSV();
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = createEl('a');
      a.href = url;
      a.download = `dashell-player-vocab-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.error('exportCSV failed:', e);
      new Notice(`Dashell Player: ${t('notice.vocabExportFailed')}`);
    } finally {
      setBusy(null);
    }
  }, []);

  const handleGenerateFlashcards = useCallback(async () => {
    const entries = useVocabularyStore.getState().entries;
    if (entries.length === 0) return;
    setBusy('generate');
    try {
      await Promise.all([
        flashcardService.refreshWordDb(entries),
        flashcardService.refreshReviewDb(entries),
      ]);
      new Notice(t('notice.flashcardsGenerated'));
    } catch (e) {
      logger.error('generateFlashcards failed:', e);
      new Notice(`Dashell Player: ${t('notice.flashcardsGenerateFailed')}`);
    } finally {
      setBusy(null);
    }
  }, [flashcardService]);

  const handleStartReview = useCallback(() => {
    flashcardService.startReview();
  }, [flashcardService]);

  return (
    <div className="lp-vocab-panel">
      <div className="lp-vocab-page-header">
        <div className="lp-vocab-heading">
          <div className="lp-vocab-heading-title">
            <Icon name="book-open" size={18} />
            <h2>{t('vocab.title')}</h2>
          </div>
          <p>{t('vocab.pageHint')}</p>
        </div>
        <div className="lp-vocab-toolbar-actions">
          <button className="lp-btn lp-btn-primary" onClick={handleStartReview}>
            <Icon name="repeat" size={14} /> {t('vocab.review')}
          </button>
          <button
            className="lp-btn"
            onClick={() => { void handleGenerateFlashcards(); }}
            disabled={busy !== null}
            title={t('vocab.syncHint')}
          >
            <Icon name={busy === 'generate' ? 'loader' : 'clipboard'} size={14} className={busy === 'generate' ? 'lp-spin' : undefined} /> {t('vocab.generateCards')}
          </button>
          <button className="lp-btn" onClick={() => setShowStats(!showStats)} aria-pressed={showStats}>
            <Icon name="bar-chart-2" size={14} /> {t('vocab.stats')}
          </button>
        </div>
        <button className="lp-btn lp-vocab-export" onClick={() => { void handleExportCSV(); }} disabled={busy !== null}>
          <Icon name={busy === 'export' ? 'loader' : 'export'} size={14} className={busy === 'export' ? 'lp-spin' : undefined} /> {t('vocab.export')}
        </button>
      </div>

      {showStats && <VocabularyStats />}

      {isLoading ? (
        <div className="lp-panel-message">
          {t('app.loading')}
        </div>
      ) : loadError ? (
        <div className="lp-vocab-empty lp-vocab-empty--guided" role="alert">
          <Icon name="alert-circle" size={24} />
          <strong>{t('vocab.loadFailed')}</strong>
          <button className="lp-btn lp-btn-primary" onClick={() => { void loadVocabulary(); }}>
            <Icon name="refresh-cw" size={14} /> {t('error.retry')}
          </button>
        </div>
      ) : (
        <VocabularyTable
          onEdit={handleEdit}
          onDelete={handleDelete}
          onOpenMedia={plugin.openMediaPicker}
        />
      )}

      {/* Edit modal */}
      {editingEntry && (
        <EditModal
          entry={editingEntry}
          onSave={handleSaveEdit}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}

function EditModal({ entry, onSave, onClose }: {
  entry: VocabEntry; onSave: (e: VocabEntry) => Promise<void>; onClose: () => void;
}) {
  const [word, setWord] = useState(entry.word);
  const [definition, setDefinition] = useState(entry.definition ?? '');
  const [translation, setTranslation] = useState(entry.translation ?? '');
  const [context, setContext] = useState(entry.context ?? '');

  const handleSave = async () => {
    await onSave({ ...entry, word, definition, translation, context });
  };

  // Modal a11y: focus the first field on open, trap Tab, close on Esc, and
  // restore focus to the previously-focused element on close.
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = modalRef.current;
    const prevFocused = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(
      root?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    focusables()[0]?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    root?.addEventListener('keydown', onKeyDown);
    return () => {
      root?.removeEventListener('keydown', onKeyDown);
      prevFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="lp-modal-overlay" onClick={onClose}>
      <div
        className="lp-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-edit-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="lp-edit-modal-title" className="lp-modal-title">{t('vocab.editWord')}</h3>
        <div className="lp-modal-fields">
          <Field label={t('vocab.word')} value={word} onChange={setWord} />
          <Field label={t('vocab.definition')} value={definition} onChange={setDefinition} />
          <Field label={t('vocab.translation')} value={translation} onChange={setTranslation} />
          <Field label={t('vocab.context')} value={context} onChange={setContext} multiline />
        </div>
        <div className="lp-modal-actions">
          <button className="lp-btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="lp-btn lp-btn-primary" onClick={() => { void handleSave(); }}>{t('common.save')}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, multiline }: {
  label: string; value: string; onChange: (v: string) => void; multiline?: boolean;
}) {
  const inputClass = 'lp-input';

  return (
    <div>
      <label className="lp-field-label">{label}</label>
      {multiline ? (
        <textarea className={`${inputClass} lp-input-multiline`} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
