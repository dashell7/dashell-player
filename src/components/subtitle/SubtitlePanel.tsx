import React, { useEffect, useId, useMemo, useState } from 'react';
import { SubtitleList } from './SubtitleList';
import { useSubtitleStore } from '../../store/subtitleStore';
import { useUIStore } from '../../store/uiStore';
import { usePlaybackStore } from '../../store/playbackStore';
import { useDictationStore } from '../../store/dictationStore';
import { useStoreApi } from '../../store/mediaSession';
import { useMediaViewOptional } from '../../context';
import { Icon } from '../shared/Icon';
import { t } from '../../i18n';

export function SubtitlePanel() {
  const id = useId();
  const ui = useStoreApi(useUIStore);
  const playback = useStoreApi(usePlaybackStore);
  const subtitles = useSubtitleStore(s => s.subtitles);
  const cueIndex = useSubtitleStore(s => s.activeIndex);
  const showTime = useUIStore(s => s.subtitleShowTime);
  const showEn = useUIStore(s => s.subtitleShowEn);
  const showZh = useUIStore(s => s.subtitleShowZh);
  const dictation = useDictationStore(s => s.dictationOpen);
  const ctx = useMediaViewOptional();
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setRevealed(false); }, [dictation, cueIndex]);
  useEffect(() => { setQuery(''); }, [subtitles]);
  const locked = dictation && !revealed;
  const matches = useMemo(() => subtitles.filter(cue => `${cue.text} ${cue.textEn ?? ''} ${cue.textZh ?? ''}`.toLowerCase().includes(query.toLowerCase())).length, [query, subtitles]);
  const save = async () => {
    if (!ctx || saving) return;
    setSaving(true);
    try { await ctx.plugin.noteService.saveAllSubtitlesToNote(subtitles, playback.getState().source, showEn, showZh); }
    finally { setSaving(false); }
  };
  return <div className="lp-subtitle-panel">
    <header className="lp-transcript-header"><div><span className="lp-eyebrow">{t('studio.transcript')}</span><h2>{t('subtitle.panel')}<span>{subtitles.length}</span></h2></div>
      <details className="lp-transcript-options"><summary className="lp-ctrl-btn" title={t('studio.more')} aria-label={t('studio.more')}><Icon name="settings" size={16} /></summary><div className="lp-transcript-options-body">
        <label><input type="checkbox" checked={showEn} onChange={e => ui.getState().setSubtitleShowEn(e.target.checked)} />{t('subtitle.overlayOriginal')}</label>
        <label><input type="checkbox" checked={showZh} onChange={e => ui.getState().setSubtitleShowZh(e.target.checked)} />{t('subtitle.overlayTranslation')}</label>
        <label><input type="checkbox" checked={showTime} onChange={e => ui.getState().setSubtitleShowTime(e.target.checked)} />{t('subtitle.showTime')}</label>
        <button className="lp-menu-action" onClick={() => ctx?.plugin.loadSubtitleFromVault()}><Icon name="folder-open" size={15} />{t('subtitle.loadFile')}</button>
        <button className="lp-menu-action" disabled={!subtitles.length || saving} onClick={() => void save()}><Icon name={saving ? 'loader' : 'file-text'} size={15} />{t('subtitle.importAll')}</button>
      </div></details>
    </header>
    {!locked && subtitles.length > 0 && <div className="lp-subtitle-search-row"><Icon name="search" size={15} /><input id={id} aria-label={t('subtitle.search')} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} placeholder={t('subtitle.searchPlaceholder')} />{query && <><span>{matches}</span><button className="lp-ctrl-btn" aria-label={t('subtitle.searchClose')} onClick={() => setQuery('')}><Icon name="x" size={14} /></button></>}</div>}
    {locked ? <div className="lp-transcript-locked"><Icon name="headphones" size={30} /><h3>{t('studio.listenFirst')}</h3><p>{t('studio.hiddenTranscript')}</p><button className="lp-btn" onClick={() => setRevealed(true)}><Icon name="eye" size={15} />{t('studio.viewReference')}</button></div>
      : subtitles.length ? <SubtitleList showTime={showTime} showEn={showEn} showZh={showZh} search={query} />
      : <div className="lp-guided-empty"><Icon name="captions" size={28} /><h3>{t('subtitle.noSubtitle')}</h3><p>{t('studio.subtitleHint')}</p><button className="lp-btn" onClick={() => ctx?.plugin.loadSubtitleFromVault()}>{t('subtitle.loadFile')}<Icon name="plus" size={14} /></button></div>}
    <footer className="lp-transcript-footer"><span className="lp-status-dot" />{t(locked ? 'studio.practiceActive' : 'studio.wordHint')}</footer>
  </div>;
}
