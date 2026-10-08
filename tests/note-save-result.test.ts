import { describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import { NoteService } from '../src/services/NoteService';
import { DEFAULT_SETTINGS, type SubtitleCue } from '../src/types';

// The studio must only show a saved checkmark after the vault write succeeds.
describe('sentence save feedback', () => {
  const cue: SubtitleCue = { id: 'one', index: 0, start: 1, end: 2, text: 'Stay curious.' };
  const source = { type: 'url' as const, url: 'https://example.com/lesson.mp3' };
  function setup(fail = false) {
    const process = fail ? vi.fn().mockRejectedValue(new Error('Disk unavailable')) : vi.fn().mockResolvedValue(undefined);
    const service = new NoteService({ vault: { getName: () => 'Study', process } } as unknown as App, () => DEFAULT_SETTINGS);
    vi.spyOn(service, 'findOrCreateNote').mockResolvedValue(new TFile());
    return { service, process };
  }
  it('reports success only after the note is appended', async () => {
    const {service, process} = setup();
    expect(await service.saveToNote(cue, source)).toBe(true);
    expect(process).toHaveBeenCalledOnce();
    expect(process.mock.calls[0]![1]('Existing\n')).toContain('Stay curious.');
  });
  it('does not report a saved sentence when disk persistence fails', async () => {
    const {service} = setup(true);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try { expect(await service.saveToNote(cue, source)).toBe(false); }
    finally { log.mockRestore(); }
  });
  it('does not report success without a media source', async () => {
    const {service, process} = setup();
    expect(await service.saveToNote(cue, null)).toBe(false);
    expect(process).not.toHaveBeenCalled();
  });
});
