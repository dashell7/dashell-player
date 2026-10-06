import { create } from './mediaSession';
import type { MediaSource, PlayerRef } from '../types';

export type PlaybackReadiness = 'idle' | 'loading' | 'ready' | 'buffering' | 'error';

interface PlaybackState {
  // State
  source: MediaSource | null;
  playerRef: PlayerRef | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  loaded: number;
  volume: number;
  playbackRate: number;
  seeking: boolean;
  readiness: PlaybackReadiness;
  errorMessage: string | null;

  // Actions
  setSource: (source: MediaSource | null) => void;
  setPlayerRef: (ref: PlayerRef | null) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setLoaded: (loaded: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setSeeking: (seeking: boolean) => void;
  setReadiness: (readiness: PlaybackReadiness, errorMessage?: string | null) => void;
  reset: () => void;
}

const initialState = {
  source: null,
  playerRef: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  loaded: 0,
  volume: 1,
  playbackRate: 1,
  seeking: false,
  readiness: 'idle' as PlaybackReadiness,
  errorMessage: null as string | null,
};

export const usePlaybackStore = create<PlaybackState>((set) => ({
  ...initialState,

  setSource: (source) => set({ source }),
  setPlayerRef: (playerRef) => set({ playerRef }),
  setPlaying: (playing) => set({ playing }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setLoaded: (loaded) => set({ loaded }),
  setVolume: (volume) => set({ volume }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setSeeking: (seeking) => set({ seeking }),
  setReadiness: (readiness, errorMessage = null) => set({ readiness, errorMessage }),
  reset: () => set((s) => ({
    ...initialState,
    // Preserve user preferences across file switches
    volume: s.volume,
    playbackRate: s.playbackRate,
  })),
}));
