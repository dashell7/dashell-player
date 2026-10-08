import React, { memo, useId } from 'react';
import type { SubtitleCue } from '../../types';
import { ClickableText } from './ClickableText';
import { formatTime } from '../../utils';
import { t } from '../../i18n';

/** Circular play icon — accent-colored circle with white triangle, absolutely positioned */
function PlayIcon() {
  return (
    <div className="lp-play-icon">
      <svg viewBox="0 0 24 24" width={10} height={10}>
        <path d="M8 5v14l11-7z" fill="currentColor" />
      </svg>
    </div>
  );
}

/** Circular save/star icon — accent-colored circle with star outline, absolutely positioned on right */
function SaveIcon({ onActivate }: { onActivate: () => void }) {
  const labelId = useId();
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onActivate();
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onActivate();
    }
  };
  return (
    <div
      className="lp-save-icon"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-labelledby={labelId}
    >
      <span id={labelId} className="lp-sr-only">{t('subtitle.saveToNote')}</span>
      {/* Star outline */}
      <svg viewBox="0 0 24 24" width={12} height={12}>
        <polygon
          points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
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

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(cue);
    }
  };

  return (
    <div
      className={`lp-subtitle-card ${isActive ? 'lp-subtitle-card-active' : ''}`}
      onClick={() => onClick(cue)}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
    >
      <PlayIcon />
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
