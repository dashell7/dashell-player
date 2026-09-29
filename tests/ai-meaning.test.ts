import { afterEach, describe, expect, test, vi } from 'vitest';
import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { generateChineseMeaning } from '../src/services/AiMeaningService';
import type { AiMeaningSettings } from '../src/types';

const configured: AiMeaningSettings = {
  enabled: true,
  endpoint: 'https://api.example.test',
  model: 'meaning-model',
};

function responseWith(status: number, payload: unknown): RequestUrlResponse {
  return {
    status,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: payload,
    text: JSON.stringify(payload),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(requestUrl).mockReset();
});

describe('generateChineseMeaning', () => {
  test('does not make a request while AI meaning is disabled', async () => {
    await expect(generateChineseMeaning({ ...configured, enabled: false }, 'test-key', 'Secret sentence', new AbortController().signal))
      .rejects.toThrow('not configured');
    expect(requestUrl).not.toHaveBeenCalled();
  });

  test('uses the configured compatible endpoint and returns only its meaning', async () => {
    vi.mocked(requestUrl).mockResolvedValue(responseWith(200, {
      choices: [{ message: { content: '表达说话者将完成某件事。' } }],
    }));
    await expect(generateChineseMeaning(configured, 'test-key', 'How am I going to make it?', new AbortController().signal))
      .resolves.toBe('表达说话者将完成某件事。');
    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.test/v1/chat/completions',
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      body: expect.stringContaining('How am I going to make it?'),
    }));
  });

  test.each([
    ['https://api.example.test/v1', 'https://api.example.test/v1/chat/completions'],
    ['https://api.example.test/v1/chat/completions', 'https://api.example.test/v1/chat/completions'],
  ])('normalizes endpoint %s', async (endpoint, expectedUrl) => {
    vi.mocked(requestUrl).mockResolvedValue(responseWith(200, {
      choices: [{ message: { content: 'meaning' } }],
    }));
    await generateChineseMeaning({ ...configured, endpoint }, 'test-key', 'sentence', new AbortController().signal);
    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({ url: expectedUrl }));
  });

  test('reports HTTP failures without exposing response content', async () => {
    vi.mocked(requestUrl).mockResolvedValue(responseWith(401, { error: 'secret details' }));
    await expect(generateChineseMeaning(configured, 'test-key', 'sentence', new AbortController().signal))
      .rejects.toThrow('AI request failed (401)');
  });

  test('rejects a pending request as soon as its signal is aborted', async () => {
    vi.mocked(requestUrl).mockReturnValue(new Promise(() => {}));
    const controller = new AbortController();
    const result = generateChineseMeaning(configured, 'test-key', 'sentence', controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});
