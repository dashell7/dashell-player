import { useStoreApi } from '../../store/mediaSession';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { List, useDynamicRowHeight } from 'react-window';
import type { ListImperativeAPI, RowComponentProps } from 'react-window';
import type { SubtitleCue } from '../../types';
import { SubtitleItem } from './SubtitleItem';
import { useSubtitleStore } from '../../store/subtitleStore';
import { usePlaybackStore } from '../../store/playbackStore';
import { useDictationStore } from '../../store/dictationStore';
import { useMediaViewOptional } from '../../context';
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { Notice } from 'obsidian';

const DEFAULT_ROW_HEIGHT = 80;

interface SubtitleListProps {
  showTime: boolean;
  showEn: boolean;
  showZh: boolean;
  /** Active search query; when set, the list is filtered to matching cues and
   *  the term is highlighted inside each result. */
  search?: string;
}

interface SubtitleRowProps {
  subtitles: SubtitleCue[];
  activeCueId: string | undefined;
  showTime: boolean;
  showEn: boolean;
  showZh: boolean;
  onClick: (cue: SubtitleCue) => void;
  onSave?: (cue: SubtitleCue) => void;
  highlight: string;
  observeRowElements: (elements: Element[] | NodeListOf<Element>) => () => void;
}

// RowComponent MUST be stable (outside the parent) for react-window v2.
// It receives custom data via rowProps spread.
function RowComponent({
  index,
  style,
  subtitles,
  activeCueId,
  showTime,
  showEn,
  showZh,
  onClick,
  onSave,
  highlight,
  observeRowElements,
  ariaAttributes,
}: RowComponentProps<SubtitleRowProps>) {
  // Measure THIS row via the dynamic-height cache's per-element observer (it
  // sets up a ResizeObserver internally and returns an unobserve cleanup).
  // Replaces a global subtree MutationObserver that re-scanned every rendered
  // row + ran querySelectorAll on each DOM mutation.
  const rowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !observeRowElements) return;
    return observeRowElements([el]);
  }, [observeRowElements]);

  const cue: SubtitleCue | undefined = subtitles[index];
  if (!cue) return null;

  return (
    <div ref={rowRef} style={style} data-row-index={index} {...ariaAttributes}>
      <SubtitleItem
        cue={cue}
        isActive={cue.id === activeCueId}
        showTime={showTime}
        showEn={showEn}
        showZh={showZh}
        onClick={onClick}
        onSave={onSave}
        highlight={highlight}
      />
    </div>
  );
}

export function SubtitleList({ showTime, showEn, showZh, search }: SubtitleListProps) {
  const useSubtitleStoreApi = useStoreApi(useSubtitleStore);
  const usePlaybackStoreApi = useStoreApi(usePlaybackStore);
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const activeIndex = useSubtitleStore((s) => s.activeIndex);
  const playheadIndex = useSubtitleStore((s) => s.playheadIndex);
  const dictationOpen = useDictationStore((s) => s.dictationOpen);
  const mediaCtx = useMediaViewOptional();
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(400);
  const displayActiveIndex = dictationOpen
    ? (playheadIndex >= 0 ? playheadIndex : activeIndex)
    : activeIndex;

  // Search filter: keep cues whose English/raw/Chinese text contains the query.
  const query = (search ?? '').trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return subtitles;
    return subtitles.filter((c) =>
      (c.textEn ?? '').toLowerCase().includes(query)
      || (c.text ?? '').toLowerCase().includes(query)
      || (c.textZh ?? '').toLowerCase().includes(query),
    );
  }, [subtitles, query]);
  // Track the active cue by id so the highlight survives filtering/re-ordering.
  const activeCueId = subtitles[displayActiveIndex]?.id;

  const listRef = useRef<ListImperativeAPI>(null);
  // Timestamp until which auto-follow is paused (set when the user scrolls by hand).
  const suppressFollowUntilRef = useRef(0);

  // Dynamic row heights — react-window v2 measures actual DOM content
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ROW_HEIGHT,
    // Re-key when display toggles change so heights are re-measured
    key: `${showTime ? 't' : ''}${showEn ? 'e' : ''}${showZh ? 'z' : ''}`,
  });

  // Auto-scroll: jump to top while searching; otherwise follow the active cue —
  // unless the user scrolled by hand recently (don't yank the list back).
  useEffect(() => {
    if (!listRef.current?.scrollToRow) return;
    try {
      if (query) {
        listRef.current.scrollToRow({ index: 0, align: 'start' });
      } else if (displayActiveIndex >= 0 && Date.now() >= suppressFollowUntilRef.current) {
        listRef.current.scrollToRow({ index: displayActiveIndex, align: 'smart' });
      }
    } catch {
      // Ignore scroll errors during initialization
    }
  }, [displayActiveIndex, query]);

  // Pause auto-follow briefly whenever the user scrolls by hand (wheel/touch),
  // so browsing earlier subtitles during playback isn't interrupted.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onUserScroll = () => { suppressFollowUntilRef.current = Date.now() + 2500; };
    el.addEventListener('wheel', onUserScroll, { passive: true });
    el.addEventListener('touchmove', onUserScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', onUserScroll);
      el.removeEventListener('touchmove', onUserScroll);
    };
  }, []);

  // Measure container height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleClick = useCallback(
    (cue: SubtitleCue) => {
      const idx = subtitles.findIndex((s) => s.id === cue.id);
      if (idx >= 0) {
        useSubtitleStoreApi.getState().setActiveIndex(idx);
        useSubtitleStoreApi.getState().setPlayheadIndex(idx);
      }
      if (dictationOpen) return;
      const player = usePlaybackStoreApi.getState().playerRef;
      if (player) {
        player.seekTo(cue.start, 'seconds');
        player.playVideo();
      }
    },
    [dictationOpen, subtitles],
  );

  const handleSave = useCallback(
    (cue: SubtitleCue) => {
      if (!mediaCtx) return;
      // Get live source from playbackStore — SubtitlePanelView passes source=null in context
      const source = usePlaybackStoreApi.getState().source;
      void mediaCtx.plugin.noteService.saveToNote(cue, source, showEn, showZh).catch((error: unknown) => {
        logger.error('Failed to save subtitle to note:', error);
        new Notice(t('notice.noteSaveFailed'));
      });
    },
    [mediaCtx, showEn, showZh],
  );

  if (subtitles.length === 0) {
    return (
      <div className="lp-subtitle-list-message">
        {t('subtitle.noSubtitle')}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="lp-virtual-list">
      {filtered.length === 0 ? (
        <div className="lp-subtitle-list-message">
          {t('subtitle.noMatch')}
        </div>
      ) : (
        <List
          listRef={listRef}
          defaultHeight={height}
          rowCount={filtered.length}
          rowHeight={dynamicRowHeight}
          overscanCount={5}
          rowComponent={RowComponent}
          rowProps={{
            subtitles: filtered,
            activeCueId,
            showTime,
            showEn,
            showZh,
            onClick: handleClick,
            onSave: mediaCtx ? handleSave : undefined,
            highlight: query,
            observeRowElements: dynamicRowHeight.observeRowElements,
          }}
        />
      )}
    </div>
  );
}
