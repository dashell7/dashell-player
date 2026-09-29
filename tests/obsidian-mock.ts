// Minimal stub of the `obsidian` module for unit tests. The real package ships
// only type declarations (no runtime entry), so any module that imports runtime
// values from 'obsidian' (normalizePath, TFolder, …) needs this alias to load
// under vitest. Configured via resolve.alias in vitest.config.ts.
import { vi } from 'vitest';

export const requestUrl = vi.fn();

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export class TAbstractFile {
  path = '';
  name = '';
}
export class TFile extends TAbstractFile {
  basename = '';
  extension = '';
}
export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export class Notice {
  constructor(_message?: string) {}
  setMessage() { return this; }
  hide() {}
}

export class Component {
  load() {}
  unload() {}
  registerEvent() {}
  registerDomEvent() {}
}
export class Plugin extends Component {
  app: unknown;
  manifest: unknown;
  addCommand() {}
  addRibbonIcon() { return document.createElement('div'); }
  addSettingTab() {}
  registerView() {}
  registerExtensions() {}
  registerEvent() {}
  registerObsidianProtocolHandler() {}
  loadData() { return Promise.resolve({}); }
  saveData() { return Promise.resolve(); }
}
export class PluginSettingTab {}
export class Setting {
  constructor(_containerEl?: unknown) {}
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addDropdown() { return this; }
  addButton() { return this; }
  addSlider() { return this; }
}
export class ItemView extends Component {}
export class MarkdownView extends ItemView {}
export class Menu {
  addItem() { return this; }
  showAtMouseEvent() {}
}
export class WorkspaceLeaf {}
export class WorkspaceSplit {}
export class WorkspaceTabs {}
export class App {}

export const Platform = {
  isDesktopApp: true,
  isMobile: false,
};

export type Modifier = 'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt';
