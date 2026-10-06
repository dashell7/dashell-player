import type { App } from 'obsidian';

export interface LookupContext {
  target: HTMLElement;
  position: { x: number; y: number };
  sentence: string;
  bookTitle: string;
}

export interface HoverContext extends LookupContext {
  sentenceZh: string;
  hoverOwner: object;
}

export interface QiaomuReaderLookup {
  openEnglishDictionary(word: string, context: LookupContext): void | Promise<void>;
  hoverEnglishDictionary?: (word: string, context: HoverContext) => void;
  closeEnglishDictionaryHover?: (owner: object) => void;
}

const READER_PLUGIN_IDS = ['dashell-reader', 'qiaomu-reader-english'] as const;

function isQiaomuReaderLookup(value: unknown): value is QiaomuReaderLookup {
  return typeof value === 'object' && value !== null &&
    'openEnglishDictionary' in value &&
    typeof value.openEnglishDictionary === 'function';
}

export function getQiaomuReaderLookup(app: App | undefined): QiaomuReaderLookup | null {
  if (!app) return null;
  const manager: unknown = Reflect.get(app, 'plugins');
  if (!manager || typeof manager !== 'object') return null;
  const plugins: unknown = Reflect.get(manager, 'plugins');
  if (!plugins || typeof plugins !== 'object') return null;
  for (const pluginId of READER_PLUGIN_IDS) {
    const candidate: unknown = Reflect.get(plugins, pluginId);
    if (isQiaomuReaderLookup(candidate)) return candidate;
  }
  return null;
}
