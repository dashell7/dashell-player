import { useMediaView } from './MediaViewContext';
import type { LangPlayerSettings } from '../types';

export function useSettings(): LangPlayerSettings {
  return useMediaView().settings;
}
