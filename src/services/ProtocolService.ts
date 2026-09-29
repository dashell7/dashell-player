import { App } from 'obsidian';
import type { ProtocolParams } from '../types';
import { logger } from '../utils';

export class ProtocolService {
  constructor(
    private app: App,
    private openMedia: (url: string, timestamp?: number) => Promise<void>,
  ) {}

  async handle(params: ProtocolParams): Promise<void> {
    const { src, t } = params;
    if (!src) {
      logger.warn('Protocol handler: missing src parameter');
      return;
    }

    let url: string;
    try {
      url = decodeURIComponent(src);
    } catch {
      logger.warn('Protocol handler: malformed src parameter');
      return;
    }

    // Only allow http/https URLs and vault-relative paths (no scheme).
    // Block file://, javascript:, data:, and other dangerous schemes.
    const schemeMatch = url.match(/^([a-z][a-z0-9+.-]*):/i);
    if (schemeMatch) {
      const scheme = schemeMatch[1]!.toLowerCase();
      if (scheme !== 'http' && scheme !== 'https') {
        logger.warn('Protocol handler: blocked non-http URL scheme:', url);
        return;
      }
    }

    const parsed = t ? parseFloat(t) : undefined;
    const timestamp = (typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0)
      ? parsed
      : undefined;

    logger.info('Protocol handler: opening', url, 'at', timestamp);
    try {
      await this.openMedia(url, timestamp);
    } catch (e) {
      logger.error('Protocol handler: openMedia failed:', e);
    }
  }
}
