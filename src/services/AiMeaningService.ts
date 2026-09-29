import type { AiMeaningSettings } from '../types';
import { requestUrl, type RequestUrlParam, type RequestUrlResponse } from 'obsidian';

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

function normalizedEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return trimmed.endsWith('/v1')
    ? `${trimmed}/chat/completions`
    : `${trimmed}/v1/chat/completions`;
}

/** A deliberately narrow, user-triggered OpenAI-compatible request. */
export async function generateChineseMeaning(
  settings: AiMeaningSettings,
  apiKey: string,
  sourceText: string,
  signal: AbortSignal,
): Promise<string> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  if (!settings.enabled || !endpoint || !settings.model.trim() || !apiKey.trim()) {
    throw new Error('AI meaning is not configured');
  }

  const request: RequestUrlParam = {
    url: endpoint,
    method: 'POST',
    throw: false,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Explain the meaning of the supplied target-language sentence in concise Chinese. Return Chinese only. Do not quote, spell, transliterate, segment, or otherwise reveal the source sentence.',
        },
        { role: 'user', content: sourceText },
      ],
    }),
  };
  const response = await requestWithSignal(request, signal);
  if (response.status >= 400) throw new Error(`AI request failed (${response.status})`);
  const payload = JSON.parse(response.text) as unknown;
  if (!isChatCompletionResponse(payload)) throw new Error('AI returned an invalid response');
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('AI returned no meaning');
  return content.trim();
}

function isChatCompletionResponse(value: unknown): value is ChatCompletionResponse {
  if (typeof value !== 'object' || value === null) return false;
  return !('choices' in value) || Array.isArray(Reflect.get(value, 'choices'));
}

function requestWithSignal(request: RequestUrlParam, signal: AbortSignal): Promise<RequestUrlResponse> {
  if (signal.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    void requestUrl(request).then(
      (response) => {
        cleanup();
        resolve(response);
      },
      (error: unknown) => {
        cleanup();
        reject(error instanceof Error ? error : new Error('AI request failed'));
      },
    );
  });
}

function createAbortError(): Error {
  const error = new Error('AI request was cancelled');
  error.name = 'AbortError';
  return error;
}
