import { create } from './mediaSession';

export type StudyMode = 'listen' | 'dictation' | 'shadow';

export type OverlayMode = 'auto' | 'original' | 'bilingual' | 'translation' | 'off';

const OVERLAY_CYCLE: OverlayMode[] = ['original', 'bilingual', 'off'];

interface UIState {
  studyMode: StudyMode;
  transcriptOpen: boolean;
  setStudyMode: (mode: StudyMode) => void;
  setTranscriptOpen: (open: boolean) => void;
  overlayMode: OverlayMode;

  // Subtitle panel display toggles — persisted across panel close/reopen
  subtitleShowTime: boolean;
  subtitleShowEn: boolean;
  subtitleShowZh: boolean;

  setOverlayMode: (mode: OverlayMode) => void;
  cycleOverlayMode: () => void;
  setSubtitleShowTime: (v: boolean) => void;
  setSubtitleShowEn: (v: boolean) => void;
  setSubtitleShowZh: (v: boolean) => void;
  reset: () => void;
}

const initialUIState = {
  studyMode: 'listen' as StudyMode,
  transcriptOpen: true,
  overlayMode: 'original' as OverlayMode,
  subtitleShowTime: false,
  subtitleShowEn: true,
  subtitleShowZh: false,
};

export const useUIStore = create<UIState>((set) => ({
  ...initialUIState,
  setStudyMode: (studyMode) => set({ studyMode }),
  setTranscriptOpen: (transcriptOpen) => set({ transcriptOpen }),

  setOverlayMode: (overlayMode) => set({ overlayMode }),
  cycleOverlayMode: () => set((s) => {
    const idx = OVERLAY_CYCLE.indexOf(s.overlayMode);
    return { overlayMode: OVERLAY_CYCLE[(idx + 1) % OVERLAY_CYCLE.length] };
  }),
  setSubtitleShowTime: (subtitleShowTime) => set({ subtitleShowTime }),
  setSubtitleShowEn: (subtitleShowEn) => set({ subtitleShowEn }),
  setSubtitleShowZh: (subtitleShowZh) => set({ subtitleShowZh }),
  reset: () => set(initialUIState),
}));
