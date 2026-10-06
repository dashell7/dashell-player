import React from 'react';
import { useSubtitleStore, selectCurrentSubtitle } from '../../store/subtitleStore';
import { useUIStore } from '../../store/uiStore';
import { ClickableText } from './ClickableText';
import { useSettings } from '../../context';

export function SubtitleOverlay() {
  const cue = useSubtitleStore(selectCurrentSubtitle);
  const config = useSubtitleStore((s) => s.config);
  const settings = useSettings();
  const overlayMode = useUIStore((s) => s.overlayMode);

  if (!cue) return null;

  // Determine what lines to show based on overlayMode
  let showEn = false;
  let showZh = false;
  let showText = false;

  if (overlayMode === 'original') {
    // Original text only: prefer textEn (the English/original line), fallback to raw text
    if (cue.textEn) { showEn = true; }
    else { showText = true; }
  } else if (overlayMode === 'bilingual') {
    // Both lines
    if (cue.textEn) { showEn = true; } else { showText = true; }
    showZh = !!cue.textZh;
  } else if (overlayMode === 'translation') {
    // Translation only
    showZh = !!cue.textZh;
    if (!showZh) { showText = true; } // fallback if no translation
  } else {
    // 'auto': follow config
    showEn = !!(config.showEnglish && cue.textEn);
    showZh = !!(config.showChinese && cue.textZh);
    showText = !showEn && !showZh;
  }

  return (
    <div
      className={`lp-subtitle-overlay lp-subtitle-overlay--${config.position}`}
    >
      {showText && (
        <SubtitleLine text={cue.text} color={settings.subtitleColor || 'var(--lp-overlay-text)'} suppressHover={!settings.enableHoverDefinition} sentenceEn={cue.text} sentenceZh={cue.textZh} cueStart={cue.start} />
      )}
      {showEn && (
        <SubtitleLine text={cue.textEn!} color={settings.subtitleColor || 'var(--lp-overlay-text)'} suppressHover={!settings.enableHoverDefinition} sentenceEn={cue.textEn} sentenceZh={cue.textZh} cueStart={cue.start} />
      )}
      {showZh && (
        <SubtitleLine text={cue.textZh!} color={settings.subtitleTranslationColor || 'var(--lp-overlay-text-secondary)'} suppressHover={!settings.enableHoverDefinition} sentenceEn={cue.textEn ?? cue.text} sentenceZh={cue.textZh} cueStart={cue.start} />
      )}
    </div>
  );
}

function SubtitleLine({ text, color, suppressHover, sentenceEn, sentenceZh, cueStart }: {
  text: string; color: string; suppressHover: boolean;
  sentenceEn?: string; sentenceZh?: string; cueStart?: number;
}) {
  return (
    <div
      className="lp-subtitle-overlay-line"
      style={{ color }}
    >
      <ClickableText text={text} suppressHoverLookup={suppressHover} sentenceEn={sentenceEn} sentenceZh={sentenceZh} cueStart={cueStart} />
    </div>
  );
}
