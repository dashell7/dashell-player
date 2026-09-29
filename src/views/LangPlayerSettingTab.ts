import { App, Notice, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type LangPlayerPlugin from '../main';
import { normalizeHotkey } from '../utils';
import { DEFAULT_DICTATION_HOTKEYS, type SubtitlePanelLocation, type SubtitleLineOrder } from '../types';

import { t } from '../i18n';

export class LangPlayerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LangPlayerPlugin) {
    super(app, plugin);
  }

  private _activeTab: string = 'general';

  private addSliderValue(
    setting: Setting,
    min: number,
    max: number,
    step: number,
    value: number,
    format: (value: number) => string,
    onChange: (value: number) => Promise<void>,
  ): Setting {
    let valueEl: HTMLSpanElement;
    setting.addSlider((slider) =>
      slider
        .setLimits(min, max, step)
        .setValue(value)
        .onChange(async (next) => {
          valueEl.setText(format(next));
          await onChange(next);
        }),
    );
    valueEl = setting.controlEl.createSpan({
      cls: 'lp-setting-value',
      text: format(value),
    });
    return setting;
  }

  display(): void {
    this.renderLegacySettings();
  }

  private renderLegacySettings(): void {
    const { containerEl } = this;
    containerEl.empty();

    const tabs = [
      { id: 'general',   label: t('settings.general') },
      { id: 'subtitle',  label: t('settings.subtitle') },
      { id: 'vocab',     label: t('settings.vocabulary') },
    ];

    const nav = containerEl.createDiv({ cls: 'lp-settings-tabs' });
    const content = containerEl.createDiv({ cls: 'lp-settings-content' });

    const panes: Record<string, HTMLElement> = {};
    const buttons: Record<string, HTMLButtonElement> = {};

    const activateTab = (id: string) => {
      this._activeTab = id;
      for (const [tid, pane] of Object.entries(panes)) {
        pane.classList.toggle('is-hidden', tid !== id);
      }
      for (const [tid, btn] of Object.entries(buttons)) {
        btn.classList.toggle('is-active', tid === id);
      }
    };

    for (const tab of tabs) {
      const btn = nav.createEl('button', { text: tab.label, cls: 'lp-settings-tab-btn' });
      btn.onclick = () => activateTab(tab.id);
      buttons[tab.id] = btn;
      panes[tab.id] = content.createDiv({ cls: 'lp-settings-pane' });
    }

    this.renderGeneralTab(panes['general']!);
    this.renderSubtitleTab(panes['subtitle']!);
    this.renderVocabTab(panes['vocab']!);

    if (!tabs.some((tab) => tab.id === this._activeTab)) {
      this._activeTab = 'general';
    }
    activateTab(this._activeTab);
  }

  private renderGeneralTab(el: HTMLElement): void {
    new Setting(el)
      .setName(t('settings.uiLanguage'))
      .setDesc(t('settings.uiLanguageDesc'))
      .addDropdown((d) =>
        d
          .addOption('en', 'English')
          .addOption('zh', '中文')
          .setValue(this.plugin.settings.uiLanguage)
          .onChange(async (v) => {
            this.plugin.settings.uiLanguage = v as 'en' | 'zh';
            await this.plugin.saveSettings();
            // Legacy rendering remains required by the declared Obsidian 1.11.4 minimum.
            this.renderLegacySettings();
          }),
      );

    new Setting(el)
      .setName(t('settings.targetLanguage'))
      .setDesc(t('settings.targetLanguageDesc'))
      .addDropdown((d) => {
        const langs: [string, string][] = [
          ['en', 'English'], ['zh', '中文'], ['ja', '日本語'], ['ko', '한국어'],
          ['fr', 'Français'], ['es', 'Español'], ['de', 'Deutsch'], ['it', 'Italiano'],
          ['pt', 'Português'], ['ru', 'Русский'], ['ar', 'العربية'], ['th', 'ไทย'],
          ['vi', 'Tiếng Việt'],
        ];
        for (const [code, name] of langs) d.addOption(code, name);
        d.setValue(this.plugin.settings.targetLanguage)
          .onChange(async (v) => { this.plugin.settings.targetLanguage = v; await this.plugin.saveSettings(); });
      });

    new Setting(el)
      .setName(t('settings.subtitleLineOrder'))
      .setDesc(t('settings.subtitleLineOrderDesc'))
      .addDropdown((d) =>
        d.addOption('auto', t('settings.lineOrderAuto'))
          .addOption('studyFirst', t('settings.lineOrderStudyFirst'))
          .addOption('translationFirst', t('settings.lineOrderTranslationFirst'))
          .setValue(this.plugin.settings.subtitleLineOrder)
          .onChange(async (v) => { this.plugin.settings.subtitleLineOrder = v as SubtitleLineOrder; await this.plugin.saveSettings(); }),
      );

    new Setting(el)
      .setName(t('settings.takeOverMediaExtensions'))
      .setDesc(t('settings.takeOverMediaExtensionsDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.takeOverMediaExtensions)
          .onChange(async (v) => { this.plugin.settings.takeOverMediaExtensions = v; await this.plugin.saveSettings(); }),
      );

    this.addSliderValue(
      new Setting(el).setName(t('settings.loopCount')).setDesc(t('settings.loopCountDesc')),
      1, 20, 1, this.plugin.settings.loopCount, (v) => String(v),
      async (v) => { this.plugin.settings.loopCount = v; await this.plugin.saveSettings(); },
    );
    new Setting(el)
      .setName(t('settings.autoPlayNext'))
      .setDesc(t('settings.autoPlayNextDesc'))
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoPlayNext)
          .onChange(async (v) => { this.plugin.settings.autoPlayNext = v; await this.plugin.saveSettings(); }),
      );
    this.addSliderValue(
      new Setting(el).setName(t('settings.playerHeight')).setDesc(t('settings.playerHeightDesc')),
      200, 800, 50, this.plugin.settings.playerHeight, (v) => `${v}px`,
      async (v) => { this.plugin.settings.playerHeight = v; await this.plugin.saveSettings(); },
    );
    new Setting(el)
      .setName(t('settings.showInlineSubtitles'))
      .setDesc(t('settings.showInlineSubtitlesDesc'))
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showInlineSubtitles)
          .onChange(async (v) => { this.plugin.settings.showInlineSubtitles = v; await this.plugin.saveSettings(); }),
      );

    // ── Dictation ──
    new Setting(el).setName(t('settings.dictation')).setHeading();
    this.addSliderValue(
      new Setting(el).setName(t('settings.dictationUnlockAfter')).setDesc(t('settings.dictationUnlockAfterDesc')),
      1, 20, 1, this.plugin.settings.dictation?.unlockShowAnswerAfter ?? 5, (v) => String(v),
      async (v) => {
        this.plugin.settings.dictation = {
          ...(this.plugin.settings.dictation ?? { unlockShowAnswerAfter: 5 }),
          unlockShowAnswerAfter: v,
        };
        await this.plugin.saveSettings();
      },
    );

    new Setting(el)
      .setName(t('settings.dictationInputStrictness'))
      .setDesc(t('settings.dictationInputStrictnessDesc'))
      .addDropdown((d) =>
        d
          .addOption('relaxed', t('settings.dictationInputRelaxed'))
          .addOption('strict', t('settings.dictationInputStrict'))
          .setValue(this.plugin.settings.dictation?.inputStrictness ?? 'relaxed')
          .onChange(async (v) => {
            this.plugin.settings.dictation = {
              ...(this.plugin.settings.dictation ?? {
                unlockShowAnswerAfter: 5,
                inputStrictness: 'relaxed',
                hotkeys: { ...DEFAULT_DICTATION_HOTKEYS },
              }),
              inputStrictness: v === 'strict' ? 'strict' : 'relaxed',
            };
            await this.plugin.saveSettings();
          }),
      );

    const ensureDictationHotkeys = () => {
      if (!this.plugin.settings.dictation) {
        this.plugin.settings.dictation = {
          unlockShowAnswerAfter: 5,
          inputStrictness: 'relaxed',
          hotkeys: { ...DEFAULT_DICTATION_HOTKEYS },
        };
      } else if (!this.plugin.settings.dictation.hotkeys) {
        this.plugin.settings.dictation.hotkeys = { ...DEFAULT_DICTATION_HOTKEYS };
      } else {
        // Backfill for pre-existing settings that loaded before this session's migration
        if (!this.plugin.settings.dictation.hotkeys.playRecording) {
          this.plugin.settings.dictation.hotkeys.playRecording = DEFAULT_DICTATION_HOTKEYS.playRecording;
        }
        if (!this.plugin.settings.dictation.hotkeys.toggleRecording) {
          this.plugin.settings.dictation.hotkeys.toggleRecording = DEFAULT_DICTATION_HOTKEYS.toggleRecording;
        }
      }
      return this.plugin.settings.dictation.hotkeys;
    };

    const addHotkeySetting = (name: string, desc: string, key: 'replay' | 'hint' | 'revealAnswer' | 'next' | 'playRecording' | 'toggleRecording') => {
      new Setting(el)
        .setName(name)
        .setDesc(desc)
        .addText((txt) => {
          const hotkeys = ensureDictationHotkeys();
          txt
            .setPlaceholder('Space / Tab / Escape / Enter')
            .setValue(hotkeys[key] ?? '')
            .onChange(async (v) => {
              const normalized = normalizeHotkey(v) || hotkeys[key];
              hotkeys[key] = normalized;
              await this.plugin.saveSettings();
            });
        });
    };

    addHotkeySetting(t('settings.dictationHotkeyReplay'), t('settings.dictationHotkeyReplayDesc'), 'replay');
    addHotkeySetting(t('settings.dictationHotkeyHint'), t('settings.dictationHotkeyHintDesc'), 'hint');
    addHotkeySetting(t('settings.dictationHotkeyReveal'), t('settings.dictationHotkeyRevealDesc'), 'revealAnswer');
    addHotkeySetting(t('settings.dictationHotkeyNext'), t('settings.dictationHotkeyNextDesc'), 'next');
    addHotkeySetting(t('settings.dictationHotkeyPlayRecording'), t('settings.dictationHotkeyPlayRecordingDesc'), 'playRecording');
    addHotkeySetting(t('settings.dictationHotkeyToggleRecording'), t('settings.dictationHotkeyToggleRecordingDesc'), 'toggleRecording');

    // ── Study habit ──
    new Setting(el).setName(t('settings.studyHabit')).setHeading();
    new Setting(el)
      .setName(t('settings.studyHabitEnabled'))
      .setDesc(t('settings.studyHabitEnabledDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.studyHabit.enabled)
          .onChange(async (v) => {
            this.plugin.settings.studyHabit.enabled = v;
            await this.plugin.saveSettings();
          }),
      );

    this.addSliderValue(
      new Setting(el).setName(t('settings.studyDailyGoal')).setDesc(t('settings.studyDailyGoalDesc')),
      1, 20, 1, this.plugin.settings.studyHabit.dailySentenceGoal, (v) => String(v),
      async (v) => {
        this.plugin.settings.studyHabit.dailySentenceGoal = v;
        await this.plugin.saveSettings();
      },
    );

    this.addSliderValue(
      new Setting(el).setName(t('settings.studyRecoveryAfter')).setDesc(t('settings.studyRecoveryAfterDesc')),
      1, 14, 1, this.plugin.settings.studyHabit.recoveryAfterDays, (v) => String(v),
      async (v) => {
        this.plugin.settings.studyHabit.recoveryAfterDays = v;
        await this.plugin.saveSettings();
      },
    );

    new Setting(el)
      .setName(t('settings.studyRecoveryPrompt'))
      .setDesc(t('settings.studyRecoveryPromptDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.studyHabit.showRecoveryPrompt)
          .onChange(async (v) => {
            this.plugin.settings.studyHabit.showRecoveryPrompt = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(el).setName(t('settings.soundPattern')).setHeading();
    this.addSliderValue(
      new Setting(el).setName(t('settings.soundPatternTarget')).setDesc(t('settings.soundPatternTargetDesc')),
      1, 100, 1, this.plugin.settings.soundPattern.repetitionTarget, (v) => String(v),
      async (v) => {
        this.plugin.settings.soundPattern.repetitionTarget = v;
        await this.plugin.saveSettings();
      },
    );

    new Setting(el).setName(t('settings.aiMeaning')).setHeading();
    new Setting(el)
      .setName(t('settings.aiMeaningEnabled'))
      .setDesc(t('settings.aiMeaningEnabledDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.aiMeaning.enabled).onChange(async (v) => {
          this.plugin.settings.aiMeaning.enabled = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(el)
      .setName(t('settings.aiMeaningEndpoint'))
      .setDesc(t('settings.aiMeaningEndpointDesc'))
      .addText((text) =>
        text.setValue(this.plugin.settings.aiMeaning.endpoint).onChange(async (v) => {
          this.plugin.settings.aiMeaning.endpoint = v.trim();
          await this.plugin.saveSettings();
        }),
      );
    new Setting(el)
      .setName(t('settings.aiMeaningModel'))
      .setDesc(t('settings.aiMeaningModelDesc'))
      .addText((text) =>
        text.setValue(this.plugin.settings.aiMeaning.model).onChange(async (v) => {
          this.plugin.settings.aiMeaning.model = v.trim();
          await this.plugin.saveSettings();
        }),
      );
    new Setting(el)
      .setName(t('settings.aiMeaningKey'))
      .setDesc(t('settings.aiMeaningKeyDesc'))
      .addText((text) => {
        text.inputEl.type = 'password';
        return text.setValue(this.plugin.getAiMeaningApiKey()).onChange((v) => {
          try {
            this.plugin.setAiMeaningApiKey(v);
          } catch {
            new Notice(t('settings.aiMeaningKeySaveFailed'));
          }
        });
      });
  }

  private renderSubtitleTab(el: HTMLElement): void {
    this.addSliderValue(
      new Setting(el).setName(t('settings.fontSize')).setDesc(t('settings.fontSizeDesc')),
      8, 80, 1, this.plugin.settings.subtitleFontSize, (v) => `${v}px`,
      async (v) => { this.plugin.settings.subtitleFontSize = v; await this.plugin.saveSettings(); },
    );
    new Setting(el)
      .setName(t('settings.fontWeight')).setDesc(t('settings.fontWeightDesc'))
      .addText((t) =>
        t.setValue(this.plugin.settings.subtitleFontWeight)
          .onChange(async (v) => { this.plugin.settings.subtitleFontWeight = v; await this.plugin.saveSettings(); }),
      );
    new Setting(el)
      .setName(t('settings.textColor')).setDesc(t('settings.textColorDesc'))
      .addColorPicker((cp) =>
        cp.setValue(this.plugin.settings.subtitleColor || '#ffffff')
          .onChange(async (v) => { this.plugin.settings.subtitleColor = v; await this.plugin.saveSettings(); }),
      );
    new Setting(el)
      .setName(t('settings.translationColor')).setDesc(t('settings.translationColorDesc'))
      .addColorPicker((cp) =>
        cp.setValue(this.plugin.settings.subtitleTranslationColor || '#cccccc')
          .onChange(async (v) => { this.plugin.settings.subtitleTranslationColor = v; await this.plugin.saveSettings(); }),
      );
    const backgroundSetting = new Setting(el)
      .setName(t('settings.bgColor')).setDesc(t('settings.bgColorDesc'))
      .addColorPicker((cp) =>
        cp.setValue(this.plugin.settings.subtitleBackgroundColor || '#000000')
          .onChange(async (v) => { this.plugin.settings.subtitleBackgroundColor = v; await this.plugin.saveSettings(); }),
      );
    this.addSliderValue(
      backgroundSetting,
      0, 100, 5, Math.round((this.plugin.settings.subtitleBgOpacity ?? 0.55) * 100), (v) => `${v}%`,
      async (v) => { this.plugin.settings.subtitleBgOpacity = v / 100; await this.plugin.saveSettings(); },
    );
    new Setting(el)
      .setName(t('settings.highlightColor')).setDesc(t('settings.highlightColorDesc'))
      .addColorPicker((cp) =>
        cp.setValue(this.plugin.settings.subtitleHighlightColor || getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim() || '#7f6df2')
          .onChange(async (v) => { this.plugin.settings.subtitleHighlightColor = v; await this.plugin.saveSettings(); }),
      );
    new Setting(el)
      .setName(t('settings.subtitlePanelLocation')).setDesc(t('settings.subtitlePanelLocationDesc'))
      .addDropdown((d) =>
        d.addOption('split', t('settings.subtitlePanelLocationSplit'))
          .addOption('tab', t('settings.subtitlePanelLocationTab'))
          .addOption('right', t('settings.subtitlePanelLocationRight'))
          .addOption('left', t('settings.subtitlePanelLocationLeft'))
          .setValue(this.plugin.settings.subtitlePanelLocation)
          .onChange(async (v) => { this.plugin.settings.subtitlePanelLocation = v as SubtitlePanelLocation; await this.plugin.saveSettings(); }),
      );
    new Setting(el)
      .setName(t('settings.subtitlePanelAutoOpen')).setDesc(t('settings.subtitlePanelAutoOpenDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.subtitlePanelAutoOpen)
          .onChange(async (v) => { this.plugin.settings.subtitlePanelAutoOpen = v; await this.plugin.saveSettings(); }),
      );
  }

  private renderVocabTab(el: HTMLElement): void {
    new Setting(el)
      .setName(t('settings.vocabHighlight')).setDesc(t('settings.vocabHighlightDesc'))
      .addToggle((t) =>
        t.setValue(this.plugin.settings.vocabHighlightEnabled)
          .onChange(async (v) => { this.plugin.settings.vocabHighlightEnabled = v; await this.plugin.saveSettings(); }),
      );

    new Setting(el)
      .setName(t('settings.enableHoverDefinition')).setDesc(t('settings.enableHoverDefinitionDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableHoverDefinition)
          .onChange(async (v) => { this.plugin.settings.enableHoverDefinition = v; await this.plugin.saveSettings(); }),
      );

    new Setting(el)
      .setName(t('settings.enableWordAudio')).setDesc(t('settings.enableWordAudioDesc'))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enableWordAudio)
          .onChange(async (v) => { this.plugin.settings.enableWordAudio = v; await this.plugin.saveSettings(); }),
      );

    new Setting(el).setName(t('settings.vocabStorage')).setHeading();

    if (this.plugin.llVocabPaths) {
      // Language Learner is installed — paths managed there, no UI needed here
    } else {
      // Language Learner not installed — show manual configuration
      const warn = el.createDiv({ cls: 'lp-ll-missing-banner' });
      warn.createSpan({ text: t('settings.llNotDetected') });

      new Setting(el)
        .setName(t('settings.vocabFolder')).setDesc(t('settings.vocabFolderDesc'))
        .addDropdown((dropdown) => {
          const opts = this.getFolderOptions(this.plugin.settings.vocabFolder);
      for (const [v, l] of Object.entries(opts)) dropdown.addOption(v, l);
          dropdown.setValue(this.plugin.settings.vocabFolder).onChange(async (path) => {
            this.plugin.settings.vocabFolder = path; this.plugin.vocabDb.setFolder(path); await this.plugin.saveSettings();
          });
        });
      new Setting(el)
        .setName(t('settings.wordDatabase')).setDesc(t('settings.wordDatabaseDesc'))
        .addDropdown((dropdown) => {
          const opts = this.getMarkdownFileOptions(this.plugin.settings.wordDatabase);
          for (const [v, l] of Object.entries(opts)) dropdown.addOption(v, l);
          dropdown.setValue(this.plugin.settings.wordDatabase).onChange(async (path) => {
            this.plugin.settings.wordDatabase = path; await this.plugin.saveSettings();
          });
        });
      new Setting(el)
        .setName(t('settings.reviewDatabase')).setDesc(t('settings.reviewDatabaseDesc'))
        .addDropdown((dropdown) => {
          const opts = this.getMarkdownFileOptions(this.plugin.settings.reviewDatabase);
          for (const [v, l] of Object.entries(opts)) dropdown.addOption(v, l);
          dropdown.setValue(this.plugin.settings.reviewDatabase).onChange(async (path) => {
            this.plugin.settings.reviewDatabase = path; await this.plugin.saveSettings();
          });
        });
      new Setting(el)
        .setName(t('settings.autoRefreshDb')).setDesc(t('settings.autoRefreshDbDesc'))
        .addToggle((toggle) =>
          toggle.setValue(this.plugin.settings.autoRefreshDb)
            .onChange(async (v) => { this.plugin.settings.autoRefreshDb = v; await this.plugin.saveSettings(); }),
        );
    }

    new Setting(el).setName(t('settings.spacedRepetition')).setHeading();
    new Setting(el)
      .setName(t('settings.flashcardTag')).setDesc(t('settings.flashcardTagDesc'))
      .addText((t) =>
        t.setValue(this.plugin.settings.flashcardTag)
          .onChange(async (v) => { this.plugin.settings.flashcardTag = v; await this.plugin.saveSettings(); }),
      );

    new Setting(el).setName(t('settings.notes')).setHeading();
    new Setting(el)
      .setName(t('settings.notePath')).setDesc(t('settings.notePathDesc'))
      .addDropdown((dropdown) => {
        const folders = this.getFolderOptions(this.plugin.settings.notePath);
        for (const [v, l] of Object.entries(folders)) dropdown.addOption(v, l);
        dropdown.setValue(this.plugin.settings.notePath).onChange(async (v) => {
          this.plugin.settings.notePath = v; await this.plugin.saveSettings();
        });
      });
    const templates = this.getMarkdownFileOptions(this.plugin.settings.noteTemplate);
    new Setting(el)
      .setName(t('settings.noteTemplate'))
      .setDesc(t('settings.noteTemplateDesc'))
      .addDropdown((dropdown) => {
        for (const [path, label] of Object.entries(templates)) {
          dropdown.addOption(path, path ? label : t('settings.noteTemplateNone'));
        }
        dropdown.setValue(this.plugin.settings.noteTemplate).onChange(async (v) => {
          this.plugin.settings.noteTemplate = v; await this.plugin.saveSettings();
        });
      });
  }

  private getFolderOptions(currentValue?: string): Record<string, string> {
    const options: Record<string, string> = {};
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .map((folder) => folder.path)
      .filter((path) => path)
      .sort((a, b) => a.localeCompare(b));

    if (currentValue && !folders.includes(currentValue)) {
      options[currentValue] = currentValue;
    }

    folders.forEach((path) => {
      options[path] = path;
    });

    return options;
  }

  private getMarkdownFileOptions(currentValue?: string): Record<string, string> {
    const options: Record<string, string> = { '': '（未设置）' };
    const files = this.app.vault
      .getMarkdownFiles()
      .map((f) => f.path)
      .sort((a, b) => a.localeCompare(b));

    if (currentValue && !files.includes(currentValue)) {
      options[currentValue] = currentValue;
    }

    files.forEach((path) => {
      options[path] = path;
    });

    return options;
  }

}
