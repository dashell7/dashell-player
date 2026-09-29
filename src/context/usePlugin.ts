import { useMediaView } from './MediaViewContext';
import type { LangPlayerPluginRef } from './MediaViewContext';

export function usePlugin(): LangPlayerPluginRef {
  return useMediaView().plugin;
}
