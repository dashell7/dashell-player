const MIN_RESUME_SECONDS = 5;
const COMPLETION_RATIO = 0.95;
const MAX_PROGRESS_ENTRIES = 100;

export function getPlaybackProgress(
  progress: Record<string, number>,
  mediaKey: string,
): number | undefined {
  const value = progress[mediaKey];
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_RESUME_SECONDS
    ? value
    : undefined;
}

export function updatePlaybackProgress(
  progress: Record<string, number>,
  mediaKey: string,
  currentTime: number,
  duration: number,
): void {
  if (!mediaKey || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;

  if (currentTime < MIN_RESUME_SECONDS || currentTime / duration >= COMPLETION_RATIO) {
    delete progress[mediaKey];
  } else {
    progress[mediaKey] = Math.floor(currentTime);
  }

  const keys = Object.keys(progress);
  while (keys.length > MAX_PROGRESS_ENTRIES) {
    const oldest = keys.shift();
    if (oldest) delete progress[oldest];
  }
}
