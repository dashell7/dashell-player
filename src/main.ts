import {
  Plugin,
  TFile,
  Menu,
  Notice,
  WorkspaceLeaf,
  type App,
} from 'obsidian';

// Obsidian internal APIs not exposed in official types
interface LanguageLearnerSettings {
  word_folder?: string;
  word_database?: string;
  review_database?: string;
}
interface ObsidianAppInternal extends App {
  plugins: { getPlugin(id: string): { settings?: LanguageLearnerSettings } | null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
import {
  type DictationProgressSnapshot,
  type LangPlayerSettings,
  type MediaSource,
  type StudyHabitProgress,
  DEFAULT_SETTINGS,
  CURRENT_SETTINGS_VERSION,
  sanitizePath,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  VIEW_TYPE_PLAYER,
  VIEW_TYPE_SUBTITLE_PANEL,
  VIEW_TYPE_VOCABULARY,
  VIEW_TYPE_DICTATION,
} from './types';
import { resetAllStores } from './store';

import { NoteService } from './services/NoteService';
import { VocabularyDbService } from './services/VocabularyDbService';
import { ProtocolService } from './services/ProtocolService';
import { StyleService } from './services/StyleService';
import { MediaFileService } from './services/MediaFileService';
import { LangPlayerView } from './views/LangPlayerView';
import { SubtitlePanelView } from './views/SubtitlePanelView';
import { DictationView } from './views/DictationView';
import { VocabularyView } from './views/VocabularyView';
import { LangPlayerSettingTab } from './views/LangPlayerSettingTab';
import { setLanguage, t } from './i18n';
import { runSettingsMigrations } from './settings/migrations';
import { migratePluginDataFromLegacyId } from './settings/pluginIdMigration';
import {
  createRuntimeRefreshSnapshot,
  getRuntimeRefreshFlags,
  type RuntimeRefreshSnapshot,
} from './settings/runtimeRefresh';
import { registerPlayerCommands } from './commands/registerPlayerCommands';
import { pickAndLoadSubtitle, pickMediaFile } from './views/SuggestModals';
import {
  buildSubtitleAssociationKey,
  isSubtitleFile,
  logger,
  normalizeSubtitleAssociations,
  removeSubtitleAssociationsForDeletedFile,
  subtitleAssociationsEqual,
  updateSubtitleAssociationsForRename,
} from './utils';
import {
  createDefaultStudyHabitProgress,
  getLocalDateKey,
  isMediaFile,
  initSpeech,
  disposeSpeech,
  updateStudyHabitProgress,
  getPlaybackProgress as readPlaybackProgress,
  updatePlaybackProgress,
} from './utils';
import { FlashcardService, playWordAudio } from './services/FlashcardService';
import type { LangPlayerPluginRef } from './context';
import { useVocabularyStore } from './store/vocabularyStore';
import { getActiveMediaSession } from './store/mediaSession';
import { useUIStore } from './store/uiStore';
import { useRecordingStore } from './store/recordingStore';

export default class LangPlayerPlugin extends Plugin {
  declare settings: LangPlayerSettings;

  // Language Learner integration: populated if that plugin is installed & enabled
  llVocabPaths: { word_folder: string; word_database: string; review_database: string } | null = null;

  // Services
  noteService!: NoteService;
  protocolService!: ProtocolService;
  styleService!: StyleService;
  mediaFileService!: MediaFileService;
  vocabDb!: VocabularyDbService;
  flashcardService!: FlashcardService;
  private runtimeRefreshSnapshot: RuntimeRefreshSnapshot | null = null;
  private playbackProgressSaveTimer: number | null = null;
  private settingsSaveQueue: Promise<void> = Promise.resolve();
  private subtitlePanelCreation: Promise<WorkspaceLeaf> | null = null;

  /** Read vocab paths from Language Learner plugin if installed & enabled. */
  private loadLanguageLearnerPaths(): void {
    try {
      const llPlugin = (this.app as unknown as ObsidianAppInternal).plugins?.getPlugin?.('obsidian-language-learner');
      const s = llPlugin?.settings;
      const word_folder = typeof s?.word_folder === 'string' ? s.word_folder : '';
      const word_database = typeof s?.word_database === 'string' ? s.word_database : '';
      const review_database = typeof s?.review_database === 'string' ? s.review_database : '';
      if (word_folder || word_database || review_database) {
        this.llVocabPaths = {
          word_folder,
          word_database,
          review_database,
        };
        logger.info('Language Learner detected — vocab paths synced:', this.llVocabPaths);
      }
    } catch {
      // LL not installed or inaccessible — silently ignore
    }
  }

  /** Effective vocab folder: LL's path if available, else LangPlayer's own setting. */
  getEffectiveVocabFolder(): string {
    return this.llVocabPaths?.word_folder || this.settings.vocabFolder || 'LangPlayer/vocabulary';
  }

  /** Effective word database path. */
  getEffectiveWordDatabase(): string {
    return this.llVocabPaths?.word_database || this.settings.wordDatabase || '';
  }

  /** Effective review database path. */
  getEffectiveReviewDatabase(): string {
    return this.llVocabPaths?.review_database || this.settings.reviewDatabase || '';
  }

  getDictationProgress(mediaKey: string): DictationProgressSnapshot | undefined {
    return this.settings.dictationProgressByMedia?.[mediaKey];
  }

  async setDictationProgress(mediaKey: string, snapshot: DictationProgressSnapshot): Promise<void> {
    if (!mediaKey) return;
    if (!this.settings.dictationProgressByMedia) {
      this.settings.dictationProgressByMedia = {};
    }
    this.settings.dictationProgressByMedia[mediaKey] = snapshot;
    await this.saveSettings();
  }

  async clearDictationProgress(mediaKey: string): Promise<void> {
    if (!mediaKey || !this.settings.dictationProgressByMedia?.[mediaKey]) return;
    delete this.settings.dictationProgressByMedia[mediaKey];
    await this.saveSettings();
  }

  async recordStudyActivity(sentenceDelta = 1): Promise<StudyHabitProgress> {
    if (!this.settings.studyHabit?.enabled) {
      return this.settings.studyHabitProgress ?? createDefaultStudyHabitProgress();
    }
    this.settings.studyHabitProgress = updateStudyHabitProgress(
      this.settings.studyHabitProgress,
      this.settings.studyHabit,
      sentenceDelta,
    );
    await this.saveSettings();
    return this.settings.studyHabitProgress;
  }

  async dismissStudyRecoveryPrompt(): Promise<StudyHabitProgress> {
    const progress = this.settings.studyHabitProgress ?? createDefaultStudyHabitProgress();
    this.settings.studyHabitProgress = {
      ...progress,
      dismissedRecoveryDate: getLocalDateKey(),
    };
    await this.saveSettings();
    return this.settings.studyHabitProgress;
  }

  private watchVocabulary(db: VocabularyDbService): () => void {
    let vocabRefreshTimer: number | null = null;
    let vocabRefreshGeneration = 0;
    const offVocabulary = db.subscribe(() => {
      const generation = ++vocabRefreshGeneration;
      if (vocabRefreshTimer !== null) window.clearTimeout(vocabRefreshTimer);
      vocabRefreshTimer = window.setTimeout(() => {
        vocabRefreshTimer = null;
        void db.getAll().then(entries => {
          if (generation !== vocabRefreshGeneration || this.vocabDb !== db) return;
          useVocabularyStore.getState().setEntries(entries);
          this.flashcardService.scheduleRefresh(entries);
        }).catch(error => {
          logger.error('Failed to refresh vocabulary:', error);
          new Notice(t('notice.vocabUpdateFailed'));
        });
      }, 50);
    });
    return () => {
      vocabRefreshGeneration++;
      offVocabulary();
      if (vocabRefreshTimer !== null) window.clearTimeout(vocabRefreshTimer);

    };
  }

  async onload(): Promise<void> {
    logger.info('=== onload() START ===');
    await this.loadSettings();
    setLanguage(this.settings.uiLanguage);
    // Prime the Web Speech voice cache (multilingual pronunciation).
    initSpeech();

    // Initialize services
    this.noteService = new NoteService(this.app, () => this.settings);
    this.mediaFileService = new MediaFileService(this.app);
    this.vocabDb = new VocabularyDbService(this.app, this.settings.vocabFolder ?? 'LangPlayer/vocabulary');
    this.flashcardService = new FlashcardService(
      this.app,
      () => this.settings,
      () => this.getEffectiveReviewDatabase(),
      () => this.getEffectiveWordDatabase(),
    );
    this.register(this.watchVocabulary(this.vocabDb));
    this.register(() => this.vocabDb.dispose());
    this.protocolService = new ProtocolService(
      this.app,
      (url, ts) => this.openMediaFromUrl(url, ts),
    );
    this.styleService = new StyleService(this.app);
    this.styleService.update(this.settings);
    this.registerSubtitleAssociationMaintenance();
    this.registerEvent(this.app.workspace.on('layout-change', () => {
      this.styleService.update(this.settings);
    }));
    this.runtimeRefreshSnapshot = createRuntimeRefreshSnapshot(this.settings);

    // Auto-create default database files if not set (and not provided by Language Learner)
    this.app.workspace.onLayoutReady(() => {
      for (const leaf of this.app.workspace.getLeavesOfType('langplayer-sound-pattern')) {
        leaf.detach();
      }
      this.loadLanguageLearnerPaths();
      this.vocabDb.setFolder(this.getEffectiveVocabFolder());
      if (!this.llVocabPaths) {
        void this.ensureDefaultDbFiles().catch((error: unknown) => {
          logger.error('Failed to initialize vocabulary database files:', error);
        });
      }
    });

    // Register views
    this.registerView(VIEW_TYPE_PLAYER, (leaf) =>
      new LangPlayerView(leaf, this.asRef()),
    );
    this.registerView(VIEW_TYPE_SUBTITLE_PANEL, (leaf) =>
      new SubtitlePanelView(leaf, this.asRef()),
    );
    this.registerView(VIEW_TYPE_DICTATION, (leaf) =>
      new DictationView(leaf, this.asRef()),
    );
    this.registerView(VIEW_TYPE_VOCABULARY, (leaf) =>
      new VocabularyView(leaf, this.asRef()),
    );

    // Register commands
    this.registerCommands();

    // Protocol handler
    this.registerObsidianProtocolHandler('langplayer', (params) =>
      this.protocolService.handle(params),
    );

    // Global click handler: click word in SR card to pronounce
    this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
      const target = evt.target instanceof Element
        ? evt.target.closest<HTMLElement>('.lp-sr-word')
        : null;
      if (target) {
        const word = target.getAttribute('data-word');
        if (word && this.settings.enableWordAudio) {
          evt.preventDefault();
          evt.stopPropagation();
          playWordAudio(word, this.settings.targetLanguage);
        }
      }
    });

    // File menu: open media files
    this.registerEvent(
      this.app.workspace.on('file-menu', (menu: Menu, file) => {
        if (file instanceof TFile && isMediaFile(file.path)) {
          menu.addItem((item) => {
            item
              .setTitle(t('notice.openInLangPlayer'))
              .setIcon('play-circle')
              .onClick(async () => {
                try {
                  await this.openMediaFile(file);
                } catch (e) {
                  new Notice(`${t('notice.openMediaFailed')} — ${(e as Error).message}`);
                  logger.error('openMediaFile error:', e);
                }
              });
          });
        }
      }),
    );

    // Add ribbon icons
    this.addRibbonIcon('play-circle', t('app.name'), () => {
      void this.activateView(VIEW_TYPE_PLAYER).catch((error: unknown) => {
        logger.error('Failed to open Dashell Player:', error);
        new Notice(t('notice.openMediaFailed'));
      });
    });
    // Settings tab
    this.addSettingTab(new LangPlayerSettingTab(this.app, this));

    // Register supported file extensions (wrapped in try-catch to avoid
    // conflicts with other plugins that may have already registered these)
    // Claiming common media extensions can conflict with other media plugins,
    // so it's now a setting (default on). The file-menu "Open in LangPlayer"
    // entry keeps working either way.
    if (this.settings.takeOverMediaExtensions) {
      try {
        // Single source of truth: every extension isMediaFile() recognizes is
        // also registered here, so file-menu "open" and double-click agree.
        this.registerExtensions(
          [...new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS])],
          VIEW_TYPE_PLAYER,
        );
      } catch (e) {
        logger.warn('Some media extensions already registered by another plugin:', e);
      }
    }

    logger.info('LangPlayer loaded');
  }

  onunload(): void {
    void this.flushPlaybackProgress().catch((error) => {
      logger.warn('Failed to save playback progress while unloading:', error);
    });
    this.flashcardService.dispose();
    // Reset all Zustand stores to prevent stale state on reload
    resetAllStores();
    disposeSpeech();
    this.styleService.destroy();
    logger.info('LangPlayer unloaded');
  }

  // ─── Settings ───────────────────────────────────────────────────────────

  async loadSettings(): Promise<void> {
    const dataMigration = await migratePluginDataFromLegacyId({
      adapter: this.app.vault.adapter,
      configDir: this.app.vault.configDir,
      manifest: this.manifest,
      legacyPluginId: 'langplayer',
      saveData: (data) => this.saveData(data),
    });
    if (dataMigration === 'migrated') {
      new Notice(t('notice.pluginDataMigrated'));
    } else if (dataMigration === 'invalid' || dataMigration === 'failed') {
      new Notice(t('notice.pluginDataMigrationFailed'));
      throw new Error(`Dashell Player legacy data migration ${dataMigration}`);
    }

    const rawData: unknown = await this.loadData();
    const raw = isRecord(rawData) ? rawData : {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    this.settings.subtitleFileByMedia = normalizeSubtitleAssociations(this.settings.subtitleFileByMedia);

    // ── Schema migration ────────────────────────────────────────────────────
    // Migrations live in settings/migrations.ts (version-keyed). Run them, then
    // stamp the current schema version.
    const fromVersion = typeof raw.settingsVersion === 'number' ? raw.settingsVersion : 0;
    const migrated = runSettingsMigrations(this.settings, fromVersion, CURRENT_SETTINGS_VERSION);
    this.settings.settingsVersion = CURRENT_SETTINGS_VERSION;
    if (migrated) {
      logger.info(`[LangPlayer] Migrated settings from v${fromVersion} → v${CURRENT_SETTINGS_VERSION}`);
      await this.saveData(this.settings);
    }
  }

  async saveSettings(): Promise<void> {
    const save = this.settingsSaveQueue.catch(() => undefined).then(async () => {
      await this.persistSettings();
    });
    this.settingsSaveQueue = save;
    await save;
  }

  private async persistSettings(): Promise<void> {
    // Sanitize all user-configurable path fields before persisting.
    // Listing only string-valued keys lets us assign without an `as any` cast.
    type StringSettingKey =
      'audioFolder' | 'notePath' | 'vocabFolder' | 'wordDatabase' | 'reviewDatabase';
    const pathFields: StringSettingKey[] = [
      'audioFolder', 'notePath', 'vocabFolder',
      'wordDatabase', 'reviewDatabase',
    ];
    for (const field of pathFields) {
      const val = this.settings[field];
      if (val) {
        this.settings[field] = sanitizePath(val);
      }
    }

    const refreshFlags = this.runtimeRefreshSnapshot
      ? getRuntimeRefreshFlags(this.runtimeRefreshSnapshot, this.settings)
      : { styles: true, language: true };

    await this.saveData(this.settings);

    if (refreshFlags.styles) {
      this.styleService.update(this.settings);
    }
    if (refreshFlags.language) {
      setLanguage(this.settings.uiLanguage);
    }
    this.runtimeRefreshSnapshot = createRuntimeRefreshSnapshot(this.settings);
    // Media views keep the same settings object for their lifetime. Notify
    // mounted React controls so toolbar display settings apply immediately.
    window.dispatchEvent(new CustomEvent('langplayer-settings-changed'));
  }

  private getPlaybackProgress(mediaKey: string): number | undefined {
    return readPlaybackProgress(this.settings.playbackProgressByMedia ?? {}, mediaKey);
  }

  private setPlaybackProgress(mediaKey: string, currentTime: number, duration: number): void {
    const progress = this.settings.playbackProgressByMedia ?? {};
    this.settings.playbackProgressByMedia = progress;
    updatePlaybackProgress(progress, mediaKey, currentTime, duration);

    if (this.playbackProgressSaveTimer === null) {
      this.playbackProgressSaveTimer = window.setTimeout(() => {
        this.playbackProgressSaveTimer = null;
        void this.saveSettings().catch((error) => {
          logger.warn('Failed to save playback progress:', error);
        });
      }, 10_000);
    }
  }

  private async flushPlaybackProgress(): Promise<void> {
    if (this.playbackProgressSaveTimer !== null) {
      window.clearTimeout(this.playbackProgressSaveTimer);
      this.playbackProgressSaveTimer = null;
      await this.saveSettings();
      return;
    }
    await this.settingsSaveQueue;
  }

  // ─── Subtitle associations ───────────────────────────────────────────────

  /**
   * Persisted associations use vault paths, not Obsidian's temporary resource
   * URLs. Keep them coherent when users reorganize or remove their media.
   */
  private registerSubtitleAssociationMaintenance(): void {
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      const next = updateSubtitleAssociationsForRename(
        this.settings.subtitleFileByMedia ?? {},
        oldPath,
        file.path,
        !(file instanceof TFile) || isSubtitleFile(oldPath) || isSubtitleFile(file.path),
      );
      void this.replaceSubtitleAssociations(next);
    }));

    this.registerEvent(this.app.vault.on('delete', (file) => {
      const next = removeSubtitleAssociationsForDeletedFile(
        this.settings.subtitleFileByMedia ?? {},
        file.path,
        !(file instanceof TFile) || isSubtitleFile(file.path),
      );
      void this.replaceSubtitleAssociations(next);
    }));
  }

  getSubtitleAssociationPath(source: MediaSource): string | undefined {
    const key = buildSubtitleAssociationKey(source);
    return key ? this.settings.subtitleFileByMedia?.[key] : undefined;
  }

  getAssociatedSubtitleFile(source: MediaSource): TFile | null {
    const path = this.getSubtitleAssociationPath(source);
    if (!path) return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile && isSubtitleFile(file.path) ? file : null;
  }

  async rememberSubtitleAssociation(source: MediaSource, subtitleFile: TFile): Promise<void> {
    const key = buildSubtitleAssociationKey(source);
    if (!key || !isSubtitleFile(subtitleFile.path)) return;

    const current = this.settings.subtitleFileByMedia ?? {};
    if (current[key] === subtitleFile.path) return;
    await this.replaceSubtitleAssociations({ ...current, [key]: subtitleFile.path });
  }

  async clearSubtitleAssociation(source: MediaSource): Promise<void> {
    const key = buildSubtitleAssociationKey(source);
    if (!key || !this.settings.subtitleFileByMedia?.[key]) return;
    const next = { ...this.settings.subtitleFileByMedia };
    delete next[key];
    await this.replaceSubtitleAssociations(next);
  }

  private async replaceSubtitleAssociations(next: Record<string, string>): Promise<void> {
    const current = this.settings.subtitleFileByMedia ?? {};
    if (subtitleAssociationsEqual(current, next)) return;
    this.settings.subtitleFileByMedia = next;
    await this.saveSettings();
  }

  private getActivePlayerView(): LangPlayerView | null {
    const activeSessionId = getActiveMediaSession();
    const views = this.app.workspace.getLeavesOfType(VIEW_TYPE_PLAYER)
      .map((leaf) => leaf.view)
      .filter((view): view is LangPlayerView => view instanceof LangPlayerView);
    return views.find((view) => view.sessionId === activeSessionId && view.getCurrentSource())
      ?? this.app.workspace.getActiveViewOfType(LangPlayerView);
  }

  private loadSubtitleFromVault(): void {
    const playerView = this.getActivePlayerView();
    const source = playerView?.getCurrentSource();
    if (!playerView || !source) {
      new Notice(t('notice.openMediaBeforeSubtitle'));
      return;
    }

    pickAndLoadSubtitle(this.app, this.settings.subtitleLineOrder, {
      sessionId: playerView.sessionId,
      isCurrent: () => playerView.isCurrentSource(source),
      onLoaded: (subtitleFile) => {
        void this.rememberSubtitleAssociation(source, subtitleFile).catch((error: unknown) => {
          logger.warn('Failed to remember subtitle association:', error);
        });
        void this.ensureSubtitlePanelVisible(playerView.leaf).catch((error: unknown) => {
          logger.warn('Failed to show subtitle panel after manual load:', error);
        });
      },
    });
  }

  // ─── Commands ───────────────────────────────────────────────────────────

  private chooseAndOpenMediaFile(): void {
    const files = this.mediaFileService.getMediaFiles();
    if (files.length === 0) {
      new Notice(t('notice.noMediaInVault'));
      return;
    }
    pickMediaFile(this.app, files, (file) => {
      this.openMediaFile(file).catch((e) => {
        new Notice(`${t('notice.openMediaFailed')} — ${(e as Error).message}`);
        logger.error('openMediaFile error:', e);
      });
    });
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'open-study-hub',
      name: t('cmd.openStudyHub'),
      callback: async () => {
        const candidates = ['Home.md', 'README.md'];
        const file = candidates
          .map((path) => this.app.vault.getAbstractFileByPath(path))
          .find((abstractFile): abstractFile is TFile => abstractFile instanceof TFile);
        if (!file) {
          new Notice(t('notice.studyHubNotFound'));
          return;
        }
        await this.app.workspace.getLeaf(false).openFile(file);
      },
    });
    this.addCommand({
      id: 'open-player',
      name: t('cmd.openPlayer'),
      callback: () => {
        this.activateView(VIEW_TYPE_PLAYER).catch((e) => {
          new Notice(`${t('notice.openPlayerFailed')} — ${(e as Error).message}`);
          logger.error('activateView(player) error:', e);
        });
      },
    });

    this.addCommand({
      id: 'open-subtitle-panel',
      name: t('cmd.openSubtitlePanel'),
      callback: () => {
        this.activateSubtitlePanel().catch((e) => {
          new Notice(`${t('notice.openSubtitlePanelFailed')} — ${(e as Error).message}`);
          logger.error('activateSubtitlePanel error:', e);
        });
      },
    });

    this.addCommand({
      id: 'open-vocabulary',
      name: t('cmd.openVocabulary'),
      callback: () => {
        this.activateView(VIEW_TYPE_VOCABULARY).catch((e) => {
          new Notice(`${t('notice.openVocabularyFailed')} — ${(e as Error).message}`);
          logger.error('activateView(vocabulary) error:', e);
        });
      },
    });

    this.addCommand({
      id: 'open-media-file',
      name: t('cmd.openMediaFile'),
      callback: () => this.chooseAndOpenMediaFile(),
    });

    // Manual subtitle loading — the only path for remote-URL media (which has
    // no sibling files to auto-detect) and for mismatched subtitle filenames.
    this.addCommand({
      id: 'load-subtitle-file',
      name: t('cmd.loadSubtitle'),
      callback: () => this.loadSubtitleFromVault(),
    });

    this.addCommand({
      id: 'start-review',
      name: t('cmd.startReview'),
      callback: () => {
        this.flashcardService.startReview();
      },
    });

    // ─── Player Hotkey Commands ───
    registerPlayerCommands(this);
  }

  // ─── View Activation ────────────────────────────────────────────────────

  private async activateView(viewType: string): Promise<WorkspaceLeaf> {
    const existing = this.app.workspace.getLeavesOfType(viewType);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]!);
      return existing[0]!;
    }

    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: viewType, active: true });
    await this.app.workspace.revealLeaf(leaf);
    return leaf;
  }

  /**
   * Open / toggle subtitle panel.
   * @param focusPanel - if false, create the panel without stealing focus from the player.
   *                     Used by auto-open so the player remains interactive after layout init.
   */
  private async activateSubtitlePanel(focusPanel = true): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SUBTITLE_PANEL);

    if (existing.length > 0) {
      const leaf = existing[0]!;
      // If the panel is already the focused view → toggle close (user explicitly
      // dismisses); otherwise it's a restored/hidden panel: reveal it.
      // getActiveViewOfType is the public API replacement for workspace.activeLeaf.
      const activeView = this.app.workspace.getActiveViewOfType(SubtitlePanelView);
      if (activeView && activeView.leaf === leaf) {
        leaf.detach();
      } else {
        await this.app.workspace.revealLeaf(leaf);
      }
      return;
    }

    const newLeaf = await this.getOrCreateSubtitlePanelLeaf();
    if (focusPanel) await newLeaf.setViewState({ type: VIEW_TYPE_SUBTITLE_PANEL, active: true });
    await this.app.workspace.revealLeaf(newLeaf);
  }

  private async ensureSubtitlePanelVisible(playerLeaf?: WorkspaceLeaf): Promise<void> {
    const player = playerLeaf?.view instanceof LangPlayerView ? playerLeaf.view : this.getActivePlayerView();
    if (player) useUIStore.forSession(player.sessionId).getState().setTranscriptOpen(true);
  }

  private async getOrCreateSubtitlePanelLeaf(): Promise<WorkspaceLeaf> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SUBTITLE_PANEL);
    if (existing.length > 0) return existing[0]!;
    if (this.subtitlePanelCreation) return this.subtitlePanelCreation;

    const creation = (async (): Promise<WorkspaceLeaf> => {
      const current = this.app.workspace.getLeavesOfType(VIEW_TYPE_SUBTITLE_PANEL);
      if (current.length > 0) return current[0]!;

      const location = this.settings.subtitlePanelLocation || 'split';
      const playerLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PLAYER);
      let leaf: WorkspaceLeaf;

      if (location === 'tab') {
        leaf = this.app.workspace.getLeaf('tab');
      } else if (playerLeaves.length > 0) {
        const direction: 'vertical' | 'horizontal' =
          (location === 'left' || location === 'right') ? 'vertical' : 'horizontal';
        leaf = this.app.workspace.createLeafBySplit(playerLeaves[0]!, direction, location === 'left');
      } else {
        leaf = this.app.workspace.getLeaf('split', 'horizontal');
      }

      await leaf.setViewState({ type: VIEW_TYPE_SUBTITLE_PANEL, active: false });
      return leaf;
    })();

    this.subtitlePanelCreation = creation;
    try {
      return await creation;
    } finally {
      if (this.subtitlePanelCreation === creation) this.subtitlePanelCreation = null;
    }
  }

  // ─── Media Opening ──────────────────────────────────────────────────────

  async openMediaFile(file: TFile, timestamp?: number): Promise<void> {
    const source = this.mediaFileService.createSourceFromFile(file, timestamp);
    const leaf = await this.activateView(VIEW_TYPE_PLAYER);
    const view = leaf.view;
    if (view instanceof LangPlayerView) {
      view.setSource(source);
    }
    // Keep the subtitle panel visible beside the player without leaving it focused.
    if (this.settings.subtitlePanelAutoOpen) {
      await this.ensureSubtitlePanelVisible(leaf);
    }
  }

  async openMediaFromUrl(url: string, timestamp?: number): Promise<void> {
    // If the URL contains no protocol (i.e. it's a vault-relative path stored by saveToNote),
    // resolve it back to a TFile so subtitle auto-loading works correctly.
    if (!url.includes('://')) {
      const file = this.app.vault.getAbstractFileByPath(url);
      if (file instanceof TFile) {
        return this.openMediaFile(file, timestamp);
      }
    }
    const source = this.mediaFileService.createSourceFromUrl(url, undefined, timestamp);
    const leaf = await this.activateView(VIEW_TYPE_PLAYER);
    const view = leaf.view;
    if (view instanceof LangPlayerView) {
      view.setSource(source);
    }
    // Auto-open subtitle panel for URL sources too, without stealing focus
    if (this.settings.subtitlePanelAutoOpen) {
      await this.ensureSubtitlePanelVisible(leaf);
    }
  }

  // ─── Ref for React Context ──────────────────────────────────────────────

  /**
   * Auto-create default word database and review database files if not set.
   */
  private async ensureDefaultDbFiles(): Promise<void> {
    const defaults: Array<{ key: 'wordDatabase' | 'reviewDatabase'; path: string }> = [
      { key: 'wordDatabase', path: 'words.md' },
      { key: 'reviewDatabase', path: 'review.md' },
    ];

    let updated = false;
    for (const item of defaults) {
      if (!this.settings[item.key]) {
        const existing = this.app.vault.getAbstractFileByPath(item.path);
        if (!existing) {
          try {
            await this.app.vault.create(item.path, '');
          } catch (e) {
            logger.warn(`Failed to create default ${item.key} file:`, e);
          }
        }
        this.settings[item.key] = item.path;
        updated = true;
      }
    }
    if (updated) {
      await this.saveSettings();
    }
  }

  /**
   * Toggle practice inside the active studio. Retain a standalone fallback
   * when there is no player to host it.
   */
  private async activateDictationView(): Promise<void> {
    const player = this.getActivePlayerView();
    if (player) {
      if (useRecordingStore.forSession(player.sessionId).getState().recorderState !== 'idle') return;
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DICTATION)) leaf.detach();
      const ui = useUIStore.forSession(player.sessionId).getState();
      ui.setStudyMode(ui.studyMode === 'dictation' ? 'listen' : 'dictation');
      await this.app.workspace.revealLeaf(player.leaf);
      return;
    }
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DICTATION);

    if (existing.length > 0) {
      const leaf = existing[0]!;
      const activeView = this.app.workspace.getActiveViewOfType(DictationView);
      if (activeView && activeView.leaf === leaf) {
        leaf.detach();
      } else {
        await this.app.workspace.revealLeaf(leaf);
      }
      return;
    }

    const playerLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_PLAYER);
    let newLeaf: WorkspaceLeaf;
    if (playerLeaves.length > 0) {
      newLeaf = this.app.workspace.createLeafBySplit(playerLeaves[0]!, 'horizontal', false);
    } else {
      newLeaf = this.app.workspace.getLeaf('tab');
    }
    await newLeaf.setViewState({ type: VIEW_TYPE_DICTATION, active: true });
    await this.app.workspace.revealLeaf(newLeaf);
  }

  private asRef(): LangPlayerPluginRef {
    return {
      settings: this.settings,
      saveSettings: () => this.saveSettings(),
      noteService: this.noteService,
      vocabDb: this.vocabDb,
      flashcardService: this.flashcardService,
      app: this.app,
      openMediaPicker: () => this.chooseAndOpenMediaFile(),
      openSubtitlePanel: () => this.activateSubtitlePanel(),
      ensureSubtitlePanelVisible: (playerLeaf?: WorkspaceLeaf) => this.ensureSubtitlePanelVisible(playerLeaf),
      openDictationView: () => this.activateDictationView(),
      openVocabulary: async () => { await this.activateView(VIEW_TYPE_VOCABULARY); },
      startReview: () => {
        this.flashcardService.startReview();
      },
      openMediaAt: (url: string, timestamp?: number) => this.openMediaFromUrl(url, timestamp),
      loadSubtitleFromVault: () => this.loadSubtitleFromVault(),
      getSubtitleAssociationPath: (source: MediaSource) => this.getSubtitleAssociationPath(source),
      getAssociatedSubtitleFile: (source: MediaSource) => this.getAssociatedSubtitleFile(source),
      rememberSubtitleAssociation: (source: MediaSource, subtitleFile: TFile) =>
        this.rememberSubtitleAssociation(source, subtitleFile),
      clearSubtitleAssociation: (source: MediaSource) => this.clearSubtitleAssociation(source),
      getDictationProgress: (mediaKey: string) => this.getDictationProgress(mediaKey),
      setDictationProgress: (mediaKey: string, snapshot: DictationProgressSnapshot) =>
        this.setDictationProgress(mediaKey, snapshot),
      clearDictationProgress: (mediaKey: string) => this.clearDictationProgress(mediaKey),
      recordStudyActivity: (sentenceDelta?: number) => this.recordStudyActivity(sentenceDelta),
      dismissStudyRecoveryPrompt: () => this.dismissStudyRecoveryPrompt(),
      getPlaybackProgress: (mediaKey: string) => this.getPlaybackProgress(mediaKey),
      setPlaybackProgress: (mediaKey: string, currentTime: number, duration: number) =>
        this.setPlaybackProgress(mediaKey, currentTime, duration),
    };
  }
}
