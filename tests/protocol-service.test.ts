import { describe, expect, it, vi } from 'vitest';
import { ProtocolService } from '../src/services/ProtocolService';

describe('ProtocolService', () => {
  it('blocks dangerous URL schemes', async () => {
    const openMedia = vi.fn();
    const svc = new ProtocolService({} as any, openMedia);

    await svc.handle({ src: encodeURIComponent('javascript:alert(1)') } as any);
    await svc.handle({ src: encodeURIComponent('file:///tmp/a.mp4') } as any);

    expect(openMedia).not.toHaveBeenCalled();
  });

  it('allows http/https and vault-relative paths', async () => {
    const openMedia = vi.fn().mockResolvedValue(undefined);
    const svc = new ProtocolService({} as any, openMedia);

    await svc.handle({ src: encodeURIComponent('https://example.com/a.mp4'), t: '12.3' } as any);
    await svc.handle({ src: encodeURIComponent('folder/video.mp4'), t: 'NaN' } as any);

    expect(openMedia).toHaveBeenNthCalledWith(1, 'https://example.com/a.mp4', 12.3);
    expect(openMedia).toHaveBeenNthCalledWith(2, 'folder/video.mp4', undefined);
  });

  it('ignores malformed percent encoding', async () => {
    const openMedia = vi.fn();
    const svc = new ProtocolService({} as any, openMedia);

    await expect(svc.handle({ src: '%E0%A4%A' } as any)).resolves.toBeUndefined();
    expect(openMedia).not.toHaveBeenCalled();
  });
});
