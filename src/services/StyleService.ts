import type { App } from 'obsidian';
import type { LangPlayerSettings } from '../types';
import {
  VIEW_TYPE_DICTATION,
  VIEW_TYPE_PLAYER,
  VIEW_TYPE_SOUND_PATTERN,
  VIEW_TYPE_SUBTITLE_PANEL,
  VIEW_TYPE_VOCABULARY,
} from '../types';

const STYLE_PROPERTIES = [
  '--lp-subtitle-font-size',
  '--lp-subtitle-font-weight',
  '--lp-subtitle-line-height',
  '--lp-subtitle-color',
  '--lp-subtitle-translation-color',
  '--lp-subtitle-bg',
  '--lp-subtitle-highlight',
  '--lp-player-height',
  '--lp-subtitle-width',
] as const;

const VIEW_TYPES = [
  VIEW_TYPE_PLAYER,
  VIEW_TYPE_SUBTITLE_PANEL,
  VIEW_TYPE_DICTATION,
  VIEW_TYPE_SOUND_PATTERN,
  VIEW_TYPE_VOCABULARY,
];

export class StyleService {
  private variables: Record<string, string> = {};

  constructor(private readonly app: App) {}

  update(settings: LangPlayerSettings): void {
    this.variables = this.buildVariables(settings);
    for (const root of this.getDocumentRoots()) {
      this.applyVariables(root);
    }
  }

  destroy(): void {
    for (const root of this.getDocumentRoots()) {
      for (const property of STYLE_PROPERTIES) root.style.removeProperty(property);
    }
    this.variables = {};
  }

  private getDocumentRoots(): Set<HTMLElement> {
    const roots = new Set<HTMLElement>();
    const addDocumentRoot = (document: Document | undefined) => {
      if (document?.documentElement) roots.add(document.documentElement);
    };

    addDocumentRoot(this.app.workspace.containerEl?.ownerDocument);
    for (const viewType of VIEW_TYPES) {
      for (const leaf of this.app.workspace.getLeavesOfType(viewType)) {
        addDocumentRoot(leaf.view.containerEl.ownerDocument);
      }
    }
    return roots;
  }

  private applyVariables(root: HTMLElement): void {
    for (const [property, value] of Object.entries(this.variables)) {
      root.style.setProperty(property, value);
    }
  }

  private hexToRgba(hex: string, opacity: number): string {
    if (hex === 'transparent') return 'transparent';
    const h = hex.replace('#', '');
    if (h.length < 6) return `rgba(0,0,0,${opacity})`;
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }

  private buildVariables(settings: LangPlayerSettings): Record<string, string> {
    return {
      '--lp-subtitle-font-size': `${settings.subtitleFontSize}px`,
      '--lp-subtitle-font-weight': settings.subtitleFontWeight,
      '--lp-subtitle-line-height': String(settings.subtitleLineHeight),
      '--lp-subtitle-color': settings.subtitleColor || 'var(--text-normal)',
      '--lp-subtitle-translation-color': settings.subtitleTranslationColor || 'var(--text-muted)',
      '--lp-subtitle-bg': this.hexToRgba(
        settings.subtitleBackgroundColor || '#000000',
        settings.subtitleBgOpacity ?? 0.55,
      ),
      '--lp-subtitle-highlight': settings.subtitleHighlightColor || 'var(--interactive-accent)',
      '--lp-player-height': `${settings.playerHeight}px`,
      '--lp-subtitle-width': `${settings.subtitleWidth}px`,
    };
  }
}
