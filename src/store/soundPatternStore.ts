import { create } from 'zustand';

interface SoundPatternState {
  open: boolean;
  requestGeneration: number;
  setOpen: (open: boolean) => void;
  nextRequestGeneration: () => number;
  reset: () => void;
}

export const useSoundPatternStore = create<SoundPatternState>((set, get) => ({
  open: false,
  requestGeneration: 0,
  setOpen: (open) => set({ open }),
  nextRequestGeneration: () => {
    const requestGeneration = get().requestGeneration + 1;
    set({ requestGeneration });
    return requestGeneration;
  },
  reset: () => set({ open: false, requestGeneration: 0 }),
}));
