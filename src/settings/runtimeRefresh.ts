import type { LangPlayerSettings } from '../types';

export interface RuntimeRefreshSnapshot {
  uiLanguage: LangPlayerSettings['uiLanguage'];
  style: Pick<
    LangPlayerSettings,
    | 'playerHeight'
    | 'subtitleWidth'
    | 'subtitleFontSize'
    | 'subtitleFontWeight'
    | 'subtitleLineHeight'
    | 'subtitleColor'
    | 'subtitleTranslationColor'
    | 'subtitleBackgroundColor'
    | 'subtitleBgOpacity'
    | 'subtitleHighlightColor'
  >;
}

export interface RuntimeRefreshFlags {
  styles: boolean;
  language: boolean;
}

export function createRuntimeRefreshSnapshot(settings: LangPlayerSettings): RuntimeRefreshSnapshot {
  return {
    uiLanguage: settings.uiLanguage,
    style: {
      playerHeight: settings.playerHeight,
      subtitleWidth: settings.subtitleWidth,
      subtitleFontSize: settings.subtitleFontSize,
      subtitleFontWeight: settings.subtitleFontWeight,
      subtitleLineHeight: settings.subtitleLineHeight,
      subtitleColor: settings.subtitleColor,
      subtitleTranslationColor: settings.subtitleTranslationColor,
      subtitleBackgroundColor: settings.subtitleBackgroundColor,
      subtitleBgOpacity: settings.subtitleBgOpacity,
      subtitleHighlightColor: settings.subtitleHighlightColor,
    },
  };
}

export function getRuntimeRefreshFlags(
  previous: RuntimeRefreshSnapshot,
  current: LangPlayerSettings,
): RuntimeRefreshFlags {
  const next = createRuntimeRefreshSnapshot(current);
  return {
    styles: Object.entries(previous.style).some(([key, value]) =>
      next.style[key as keyof RuntimeRefreshSnapshot['style']] !== value,
    ),
    language: previous.uiLanguage !== next.uiLanguage,
  };
}
