import { create } from './mediaSession';
import type { RecorderState } from '../types';

/** Most recent finished recording — kept in-memory for instant "listen back".
 *  blob URL is created with URL.createObjectURL and must be revoked when
 *  replaced or cleared (see clearLastRecording / setLastRecording cleanup). */
export interface LastRecording {
  /** Object URL for instant playback (no file read). */
  url: string;
  /** Duration in seconds (measured from <audio> loadedmetadata). */
  durationSec: number;
  /** Vault-relative path where the recording was persisted. */
  filePath: string;
  /** Subtitle text active when recording started (empty if no active cue). */
  subtitleText: string;
}

interface RecordingStoreState {
  // State
  recorderState: RecorderState;
  audioLevel: number; // 0–1 RMS level from mic
  lastRecording: LastRecording | null;

  // Actions
  setRecorderState: (state: RecorderState) => void;
  setAudioLevel: (level: number) => void;
  /** Set the playback target. Revokes the previous URL to prevent memory leak. */
  setLastRecording: (rec: LastRecording | null) => void;
  /** Convenience: dismiss + revoke. */
  clearLastRecording: () => void;
  reset: () => void;
}

const initialState = {
  recorderState: 'idle' as RecorderState,
  audioLevel: 0,
  lastRecording: null as LastRecording | null,
};

export const useRecordingStore = create<RecordingStoreState>((set, get) => ({
  ...initialState,

  setRecorderState: (recorderState) => set({ recorderState }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),

  setLastRecording: (rec) => {
    const prev = get().lastRecording;
    if (prev && prev.url && prev.url !== rec?.url) {
      // Revoke the old blob URL to free memory
      try { URL.revokeObjectURL(prev.url); } catch { /* ignore */ }
    }
    set({ lastRecording: rec });
  },

  clearLastRecording: () => {
    const prev = get().lastRecording;
    if (prev?.url) {
      try { URL.revokeObjectURL(prev.url); } catch { /* ignore */ }
    }
    set({ lastRecording: null });
  },

  reset: () => {
    const prev = get().lastRecording;
    if (prev?.url) {
      try { URL.revokeObjectURL(prev.url); } catch { /* ignore */ }
    }
    set(initialState);
  },
}));
