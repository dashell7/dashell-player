import { App, FuzzySuggestModal, Notice, TFile } from 'obsidian';
import type { SubtitleLineOrder } from '../types';
import { isSubtitleFile, loadSubtitleCues, logger } from '../utils';
import { useSubtitleStore } from '../store/subtitleStore';
import { getActiveMediaSession } from '../store/mediaSession';
import { t } from '../i18n';

/** Generic vault-file fuzzy picker. */
class FilePickerModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private files: TFile[],
    placeholder: string,
    private onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(placeholder);
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

/** Fuzzy-pick a media file from the vault. */
export function pickMediaFile(app: App, files: TFile[], onChoose: (file: TFile) => void): void {
  new FilePickerModal(app, files, t('modal.pickMedia'), onChoose).open();
}

/**
 * Fuzzy-pick a subtitle file (.srt/.vtt) from the vault and load it into the
 * subtitle store. This is the manual path for when auto-detection can't help:
 * remote-URL media (no sibling files) or subtitles named/located differently
 * from the media file.
 */
export function pickAndLoadSubtitle(
  app: App,
  lineOrder: SubtitleLineOrder,
  options?: {
    sessionId?: string;
    isCurrent?: () => boolean;
    onLoaded?: (file: TFile) => void;
  },
): void {
  const files = app.vault.getFiles().filter((f) => isSubtitleFile(f.path));
  if (files.length === 0) {
    new Notice(t('notice.noSubtitleFiles'));
    return;
  }
  new FilePickerModal(app, files, t('modal.pickSubtitle'), (file) => {
    void (async () => {
      try {
        const cues = await loadSubtitleCues(app, file, lineOrder);
        if (cues.length === 0) {
          new Notice(t('notice.subtitleParseEmpty'));
          return;
        }
        if (options?.isCurrent && !options.isCurrent()) return;
        const sessionId = options?.sessionId ?? getActiveMediaSession();
        useSubtitleStore.forSession(sessionId).getState().setSubtitles(cues);
        new Notice(t('notice.subtitleLoaded', { n: cues.length, name: file.basename }));
        options?.onLoaded?.(file);
      } catch (e) {
        logger.error('Manual subtitle load failed:', e);
        new Notice(t('notice.subtitleParseEmpty'));
      }
    })();
  }).open();
}
