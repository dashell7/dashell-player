import React, { memo } from 'react';
import type { SubtitleCue } from '../../types';
import { ClickableText } from './ClickableText';
import { formatTime } from '../../utils';
import { t } from '../../i18n';
import { Icon } from '../shared/Icon';

function SaveIcon({ onActivate }: { onActivate: () => void }) {
  return <button className="lp-save-icon" aria-label={t('subtitle.saveToNote')} title={t('subtitle.saveToNote')}
    onClick={event => { event.stopPropagation(); onActivate(); }}>
    <Icon name="bookmark" size={13} />
  </button>;
}

interface SubtitleItemProps {
  cue: SubtitleCue;
  isActive: boolean;
  showTime: boolean;
  showEn: boolean;
  showZh: boolean;
  onClick: (cue: SubtitleCue) => void;
  onSave?: (cue: SubtitleCue) => void;
  /** Search term to highlight inside the rendered text. */
  highlight?: string;
}

export const SubtitleItem = memo(function SubtitleItem({
  cue,
  isActive,
  showTime,
  showEn,
  showZh,
  onClick,
  onSave,
  highlight,
}: SubtitleItemProps) {
  const hasEn = showEn && cue.textEn;
  const hasZh = showZh && cue.textZh;
  // Unsplit subtitles are the original language and remain visible when either language is enabled.
  const showRaw = (showEn || showZh) && !cue.textEn && !cue.textZh;
  // Nothing to display text-wise — show empty placeholder to keep card clickable
  const showEmpty = !showRaw && !hasEn && !hasZh && !showTime;

  const handleSave = () => {
    onSave?.(cue);
  };

  return (
    <div
      className={`lp-subtitle-card ${isActive ? 'lp-subtitle-card-active' : ''}`}
      onClick={() => { if (!window.getSelection()?.toString()) onClick(cue); }}
      aria-current={isActive ? 'true' : undefined}
    >
      <button className="lp-subtitle-play" aria-label={`${t('player.play')} · ${cue.index + 1}`} onClick={event => { event.stopPropagation(); onClick(cue); }}>
        {isActive ? <Icon name="play" size={11} /> : String(cue.index + 1).padStart(2, '0')}
      </button>
      {onSave && <SaveIcon onActivate={handleSave} />}
      {showTime && (
        <div className="lp-subtitle-time">
          {formatTime(cue.start)} → {formatTime(cue.end)}
        </div>
      )}
      {showRaw && (
        <div className="lp-subtitle-line-en">
          <span><ClickableText text={cue.text} sentenceEn={cue.text} sentenceZh={cue.textZh} highlight={highlight} cueStart={cue.start} /></span>
        </div>
      )}
      {hasEn && (
        <div className="lp-subtitle-line-en">
          <span><ClickableText text={cue.textEn!} sentenceEn={cue.textEn} sentenceZh={cue.textZh} highlight={highlight} cueStart={cue.start} /></span>
        </div>
      )}
      {hasZh && (
        <div className="lp-subtitle-line-zh">
          {cue.textZh}
        </div>
      )}
      {showEmpty && (
        <div className="lp-subtitle-line-en lp-subtitle-line-empty" />
      )}
    </div>
  );
});
