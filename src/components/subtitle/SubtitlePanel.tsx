import React, { useCallback, useMemo, useState } from 'react';
import { SubtitleList } from './SubtitleList';
import { useSubtitleStore } from '../../store/subtitleStore';
import { useUIStore } from '../../store/uiStore';
import { usePlaybackStore } from '../../store/playbackStore';
import { useDictationStore } from '../../store/dictationStore';
import { useRecordingStore } from '../../store/recordingStore';
import { useMediaViewOptional } from '../../context';
import { Icon } from '../shared/Icon';
import { t } from '../../i18n';

export function SubtitlePanel() {
  const showTime = useUIStore((s) => s.subtitleShowTime);
  const showEn = useUIStore((s) => s.subtitleShowEn);
  const showZh = useUIStore((s) => s.subtitleShowZh);
  const { setSubtitleShowTime, setSubtitleShowEn, setSubtitleShowZh } = useUIStore.getState();
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const subtitleCount = subtitles.length;
  const offset = useSubtitleStore((s) => s.offset);
  const dictationOpen = useDictationStore((s) => s.dictationOpen);
  const recorderState = useRecordingStore((s) => s.recorderState);
  const isRecordingBusy =
    recorderState === 'preparing' || recorderState === 'recording' || recorderState === 'stopping';
  const mediaCtx = useMediaViewOptional();
  const [importing, setImporting] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const matchCount = useMemo(() => {
    if (!q) return 0;
    return subtitles.filter((c) =>
      (c.textEn ?? '').toLowerCase().includes(q)
      || (c.text ?? '').toLowerCase().includes(q)
      || (c.textZh ?? '').toLowerCase().includes(q),
    ).length;
  }, [subtitles, q]);

  const closeSearch = useCallback(() => {
    setQuery('');
    setSearchOpen(false);
  }, []);

  const handleImportAll = useCallback(async () => {
    if (!mediaCtx || importing) return;
    const cues = useSubtitleStore.getState().subtitles;
    const source = usePlaybackStore.getState().source;
    if (cues.length === 0) return;
    setImporting(true);
    try {
      await mediaCtx.plugin.noteService.saveAllSubtitlesToNote(cues, source, showEn, showZh);
    } finally {
      setImporting(false);
    }
  }, [mediaCtx, showEn, showZh, importing]);

  const toggleDictation = useCallback(() => {
    if (isRecordingBusy) return;
    mediaCtx?.plugin.openDictationView().catch(() => {});
  }, [isRecordingBusy, mediaCtx]);

  return (
    <div className="lp-subtitle-panel">
      {/* Compact toolbar */}
      <div className="lp-subtitle-toolbar">
        {/* Left: count + search + import icon buttons */}
        <div className="lp-subtitle-toolbar-group">
          <span className="lp-subtitle-count">
            {subtitleCount > 0 ? subtitleCount : ''}
          </span>
          {mediaCtx && (
            <IconBtn
              icon="folder-open"
              onClick={() => mediaCtx.plugin.loadSubtitleFromVault()}
              title={t('subtitle.loadFile')}
            />
          )}
          {subtitleCount > 0 && (
            <IconBtn
              icon="search"
              active={searchOpen}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              title={t('subtitle.search')}
            />
          )}
          {mediaCtx && subtitleCount > 0 && (
            <ImportBtn importing={importing} onClick={() => { void handleImportAll(); }} title={t('subtitle.importAll')} />
          )}
        </div>

        {/* Right: display toggles + dictation */}
        <div className="lp-subtitle-toolbar-group lp-subtitle-toolbar-group--end">
          <OffsetControl offset={offset} />
          <Divider />
          <ToggleBtn label={t('subtitle.showEn')} active={showEn} onClick={() => setSubtitleShowEn(!showEn)} />
          <ToggleBtn label={t('subtitle.showZh')} active={showZh} onClick={() => setSubtitleShowZh(!showZh)} />
          <ToggleBtn label={t('subtitle.showTime')} active={showTime} onClick={() => setSubtitleShowTime(!showTime)} />
          <Divider />
          <DictationToggleBtn
            active={dictationOpen}
            disabled={isRecordingBusy || subtitleCount === 0 || !mediaCtx}
            onClick={toggleDictation}
            title={t('dictation.toggle')}
          />
        </div>
      </div>

      {/* Search row (toggled by the search button) */}
      {searchOpen && (
        <div className="lp-subtitle-search-row">
          <Icon name="search" size={13} />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') closeSearch(); }}
            placeholder={t('subtitle.searchPlaceholder')}
            spellCheck={false}
            className="lp-subtitle-search-input"
          />
          {q && (
            <span className="lp-subtitle-search-count">
              {matchCount} {t('subtitle.searchMatches')}
            </span>
          )}
          <button
            onClick={closeSearch}
            aria-label={t('subtitle.searchClose')}
            className="lp-subtitle-search-close"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* List */}
      <SubtitleList showTime={showTime} showEn={showEn} showZh={showZh} search={searchOpen ? query : ''} />
    </div>
  );
}

function IconBtn({ icon, active, onClick, title }: { icon: string; active?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      className={`lp-ctrl-btn${active ? ' lp-ctrl-btn--active' : ''}`}
      onClick={onClick}
      aria-label={title}
      title={title}
      aria-pressed={active}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function ImportBtn({ importing, onClick, title }: { importing: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      className="lp-ctrl-btn"
      onClick={onClick}
      disabled={importing}
      aria-label={title}
      title={title}
    >
      {importing
        ? <Icon name="loader" size={12} className="lp-spin" />
        : <Icon name="import" size={13} />}
    </button>
  );
}

function Divider() {
  return <span className="lp-control-divider" />;
}

function OffsetControl({ offset }: { offset: number }) {
  return (
    <div className="lp-offset-control">
      <button
        type="button"
        className="lp-ctrl-btn"
        onClick={() => useSubtitleStore.getState().adjustOffset(-0.5)}
        aria-label={t('subtitle.offsetEarlier')}
        title={t('subtitle.offsetEarlier')}
      >-</button>
      <button
        type="button"
        className={`lp-ctrl-btn lp-ctrl-btn--label${offset !== 0 ? ' lp-ctrl-btn--accent' : ''}`}
        onClick={() => useSubtitleStore.getState().setOffset(0)}
        aria-label={t('subtitle.offsetReset')}
        title={t('subtitle.offsetReset')}
      >
        {offset === 0 ? t('subtitle.offsetLabel') : `${offset > 0 ? '+' : ''}${offset.toFixed(1)}s`}
      </button>
      <button
        type="button"
        className="lp-ctrl-btn"
        onClick={() => useSubtitleStore.getState().adjustOffset(0.5)}
        aria-label={t('subtitle.offsetLater')}
        title={t('subtitle.offsetLater')}
      >+</button>
    </div>
  );
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`lp-ctrl-btn lp-ctrl-btn--label${active ? ' lp-ctrl-btn--active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function DictationToggleBtn({
  active, disabled, onClick, title,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      className={`lp-ctrl-btn${active ? ' lp-ctrl-btn--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
      title={title}
      aria-pressed={active}
    >
      <Icon name="type" size={13} />
    </button>
  );
}
