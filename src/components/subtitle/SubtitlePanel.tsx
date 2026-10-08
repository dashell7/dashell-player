import { useStoreApi } from '../../store/mediaSession';
import React, { useCallback, useId, useMemo, useState } from 'react';
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
  const searchCloseLabelId = useId();
  const useUIStoreApi = useStoreApi(useUIStore);
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const showTime = useUIStore((s) => s.subtitleShowTime);
  const showEn = useUIStore((s) => s.subtitleShowEn);
  const showZh = useUIStore((s) => s.subtitleShowZh);
  const { setSubtitleShowTime, setSubtitleShowEn, setSubtitleShowZh } = useUIStoreApi.getState();
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const subtitleCount = subtitles.length;
  const dictationOpen = useDictationStore((s) => s.dictationOpen);
  const recorderState = useRecordingStore((s) => s.recorderState);
  const isRecordingBusy =
    recorderState === 'preparing' || recorderState === 'recording' || recorderState === 'stopping';
  const mediaCtx = useMediaViewOptional();
  const [savingNote, setSavingNote] = useState(false);
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

  const handleSaveAll = useCallback(async () => {
    if (!mediaCtx || savingNote) return;
    const cues = useSubtitleStoreApi.getState().subtitles;
    const source = usePlaybackStoreApi.getState().source;
    if (cues.length === 0) return;
    setSavingNote(true);
    try {
      await mediaCtx.plugin.noteService.saveAllSubtitlesToNote(cues, source, showEn, showZh);
    } finally {
      setSavingNote(false);
    }
  }, [mediaCtx, showEn, showZh, savingNote]);

  const toggleDictation = useCallback(() => {
    if (isRecordingBusy) return;
    mediaCtx?.plugin.openDictationView().catch(() => {});
  }, [isRecordingBusy, mediaCtx]);

  return (
    <div className="lp-subtitle-panel">
      {/* File actions and display choices stay in separate groups at every width. */}
      <div className="lp-subtitle-toolbar">
        {/* Left: count + search + import icon buttons */}
        <div className="lp-subtitle-toolbar-group">
          <span className="lp-subtitle-count">
            {t('subtitle.count', { n: subtitleCount })}
          </span>
          {mediaCtx && (
            <IconBtn
              icon="folder-open"
              onClick={() => mediaCtx.plugin.loadSubtitleFromVault()}
              label={t('subtitle.loadFile')}
            />
          )}
          {subtitleCount > 0 && (
            <IconBtn
              icon="search"
              active={searchOpen}
              onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
              label={t('subtitle.search')}
            />
          )}
          {mediaCtx && subtitleCount > 0 && (
            <SaveToNoteBtn saving={savingNote} onClick={() => { void handleSaveAll(); }} label={t('subtitle.importAll')} />
          )}
        </div>

        {/* Right: display toggles + dictation */}
        <div className="lp-subtitle-toolbar-group lp-subtitle-toolbar-group--end">
          <div className="lp-subtitle-display-toggles">
            <ToggleBtn icon="latin-a" label={t('subtitle.showEn')} active={showEn} onClick={() => setSubtitleShowEn(!showEn)} />
            <ToggleBtn icon="hanzi" label={t('subtitle.showZh')} active={showZh} onClick={() => setSubtitleShowZh(!showZh)} />
            <ToggleBtn icon="clock" label={t('subtitle.showTime')} active={showTime} onClick={() => setSubtitleShowTime(!showTime)} />
          </div>
          <DictationToggleBtn
            active={dictationOpen}
            disabled={isRecordingBusy || subtitleCount === 0 || !mediaCtx}
            onClick={toggleDictation}
            label={t('dictation.short')}
          />
        </div>
      </div>

      {/* Search row (toggled by the search button) */}
      {searchOpen && (
        <div className="lp-subtitle-search-row">
          <Icon name="search" size={13} />
          <label className="lp-sr-only" htmlFor="lp-subtitle-search">{t('subtitle.search')}</label>
          <input
            id="lp-subtitle-search"
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
            className="lp-subtitle-search-close"
            aria-labelledby={searchCloseLabelId}
          >
            <Icon name="x" size={14} />
            <span id={searchCloseLabelId} className="lp-sr-only">{t('subtitle.searchClose')}</span>
          </button>
        </div>
      )}

      {/* List */}
      <SubtitleList showTime={showTime} showEn={showEn} showZh={showZh} search={searchOpen ? query : ''} />
    </div>
  );
}

function IconBtn({ icon, active, onClick, label }: { icon: string; active?: boolean; onClick: () => void; label: string }) {
  const labelId = useId();
  return (
    <button
      type="button"
      className={`lp-ctrl-btn lp-icon-button${active ? ' lp-ctrl-btn--active' : ''}`}
      onClick={onClick}
      aria-labelledby={labelId}
      aria-pressed={active === undefined ? undefined : active}
    >
      <Icon name={icon} size={16} />
      <span id={labelId} className="lp-sr-only">{label}</span>
    </button>
  );
}

function SaveToNoteBtn({ saving, onClick, label }: { saving: boolean; onClick: () => void; label: string }) {
  const labelId = useId();
  return (
    <button
      type="button"
      className="lp-ctrl-btn lp-icon-button"
      onClick={onClick}
      aria-labelledby={labelId}
      disabled={saving}
    >
      {saving
        ? <Icon name="loader" size={16} className="lp-spin" />
        : <Icon name="file-text" size={16} />}
      <span id={labelId} className="lp-sr-only">{label}</span>
    </button>
  );
}

function ToggleBtn({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) {
  const labelId = useId();
  return (
    <button
      type="button"
      className={`lp-ctrl-btn lp-icon-button${active ? ' lp-ctrl-btn--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-labelledby={labelId}
    >
      <Icon name={icon} size={16} />
      <span id={labelId} className="lp-sr-only">{label}</span>
    </button>
  );
}

function DictationToggleBtn({
  active, disabled, onClick, label,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  const labelId = useId();
  return (
    <button
      type="button"
      className={`lp-ctrl-btn lp-icon-button${active ? ' lp-ctrl-btn--active' : ''}`}
      onClick={onClick}
      aria-labelledby={labelId}
      disabled={disabled}
      aria-pressed={active}
    >
      <Icon name="keyboard" size={16} />
      <span id={labelId} className="lp-sr-only">{label}</span>
    </button>
  );
}
