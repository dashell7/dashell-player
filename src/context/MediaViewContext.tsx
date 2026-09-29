import React, { createContext, useContext, useMemo } from 'react';
import type { DictationProgressSnapshot, LangPlayerSettings, MediaSource, SoundPatternProgressSnapshot, StudyHabitProgress, SubtitleCue } from '../types';
import type { VocabularyDbService } from '../services/VocabularyDbService';
import type { FlashcardService } from '../services/FlashcardService';

// Forward-declare plugin type to avoid circular import
export interface LangPlayerPluginRef {
  settings: LangPlayerSettings;
  saveSettings: () => Promise<void>;
  getAiMeaningApiKey: () => string;
  setAiMeaningApiKey: (apiKey: string) => void;
  noteService: {
    saveToNote: (cue: SubtitleCue, source: MediaSource | null, showEn?: boolean, showZh?: boolean) => Promise<void>;
    openStudyNote: (source: MediaSource | null) => Promise<void>;
    saveAllSubtitlesToNote: (cues: SubtitleCue[], source: MediaSource | null, showEn?: boolean, showZh?: boolean) => Promise<void>;
  };
  vocabDb: VocabularyDbService;
  flashcardService: FlashcardService;
  app: import('obsidian').App;
  openMediaPicker: () => void;
  openSubtitlePanel: () => Promise<void>;
  openDictationView: () => Promise<void>;
  openSoundPatternView: () => Promise<void>;
  openVocabulary: () => Promise<void>;
  startReview: () => void;
  /** Open a media source (vault path or remote URL) at an optional timestamp —
   *  used by vocabulary "jump back to source" links. */
  openMediaAt: (url: string, timestamp?: number) => Promise<void>;
  /** Fuzzy-pick a subtitle file from the vault and load it into the store. */
  loadSubtitleFromVault: () => void;
  getDictationProgress: (mediaKey: string) => DictationProgressSnapshot | undefined;
  setDictationProgress: (mediaKey: string, snapshot: DictationProgressSnapshot) => Promise<void>;
  clearDictationProgress: (mediaKey: string) => Promise<void>;
  getSoundPatternProgress: (mediaKey: string) => SoundPatternProgressSnapshot | undefined;
  setSoundPatternProgress: (mediaKey: string, snapshot: SoundPatternProgressSnapshot) => Promise<void>;
  clearSoundPatternProgress: (mediaKey: string) => Promise<void>;
  recordStudyActivity: (sentenceDelta?: number) => Promise<StudyHabitProgress>;
  dismissStudyRecoveryPrompt: () => Promise<StudyHabitProgress>;
  getPlaybackProgress: (mediaKey: string) => number | undefined;
  setPlaybackProgress: (mediaKey: string, currentTime: number, duration: number) => void;
}

// ─── Context Value ──────────────────────────────────────────────────────────

export interface MediaViewContextValue {
  plugin: LangPlayerPluginRef;
  settings: LangPlayerSettings;
  source: MediaSource | null;
  onInsertTimestamp: (cue: SubtitleCue) => void;
  onOpenNote: () => void;
  // Simple mic button: start/stop basic audio recording (saves blob to vault)
  onMicClick: () => void;
}

const noop = () => {};
const MediaViewContext = createContext<MediaViewContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

interface ProviderProps {
  plugin: LangPlayerPluginRef;
  source: MediaSource | null;
  onMicClick?: () => void;
  children: React.ReactNode;
}

export function MediaViewProvider({ plugin, source, onMicClick, children }: ProviderProps) {
  const callbacks = useMemo(
    () => ({
      onInsertTimestamp: (cue: SubtitleCue) =>
        plugin.noteService.saveToNote(cue, source),
      onOpenNote: () => plugin.noteService.openStudyNote(source),
    }),
    [plugin, source],
  );

  const value = useMemo(
    () => ({
      plugin,
      settings: plugin.settings,
      source,
      ...callbacks,
      onMicClick: onMicClick ?? noop,
    }),
    [plugin, source, callbacks, onMicClick],
  );

  return (
    <MediaViewContext.Provider value={value}>
      {children}
    </MediaViewContext.Provider>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useMediaView(): MediaViewContextValue {
  const ctx = useContext(MediaViewContext);
  if (!ctx) throw new Error('useMediaView must be used within MediaViewProvider');
  return ctx;
}

/** Returns the context value or null if outside MediaViewProvider */
export function useMediaViewOptional(): MediaViewContextValue | null {
  return useContext(MediaViewContext);
}
