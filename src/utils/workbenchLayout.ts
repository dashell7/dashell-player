import type { StudyMode } from '../store/uiStore';

export const WORKBENCH_LAYOUT_KEY = 'dashell-player:workbench-layout';
export const DEFAULT_WORKBENCH_LAYOUT = { media: 60, transcript: 32 };
export type WorkbenchLayout = typeof DEFAULT_WORKBENCH_LAYOUT;
export type WorkbenchLayouts = Partial<Record<StudyMode, WorkbenchLayout>>;

export function clampLayoutSize(value: number): number {
  return Math.min(85, Math.max(15, value));
}

export function readWorkbenchLayouts(storage: Pick<Storage, 'getItem'>): WorkbenchLayouts {
  try {
    const saved = JSON.parse(storage.getItem(WORKBENCH_LAYOUT_KEY) ?? '{}');
    const layouts: WorkbenchLayouts = {};
    for (const mode of ['listen', 'dictation', 'shadow'] as const) {
      const layout = saved?.[mode];
      if (typeof layout?.media === 'number' && Number.isFinite(layout.media)
        && typeof layout?.transcript === 'number' && Number.isFinite(layout.transcript)) {
        layouts[mode] = { media: clampLayoutSize(layout.media), transcript: clampLayoutSize(layout.transcript) };
      }
    }
    return layouts;
  } catch { return {}; }
}
