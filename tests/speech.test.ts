import { describe, it, expect } from 'vitest';
import { isSpeechSupported, speakText, stopSpeech } from '../src/utils/speech';

// vitest runs in a 'node' environment with no `window`, so speech is
// unsupported here — assert the guards make every call a safe no-op.
describe('speech', () => {
  it('reports unsupported when speechSynthesis is absent', () => {
    expect(isSpeechSupported()).toBe(false);
  });

  it('speakText is a safe no-op when unsupported', () => {
    expect(() => speakText('hello', 'en')).not.toThrow();
    expect(() => speakText('', 'ja')).not.toThrow();
  });

  it('stopSpeech is a safe no-op when unsupported', () => {
    expect(() => stopSpeech()).not.toThrow();
  });
});
