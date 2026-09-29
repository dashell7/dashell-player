/**
 * Multilingual pronunciation via the Web Speech API (speechSynthesis).
 *
 * LangPlayer makes no direct TTS request. The OS/browser controls whether the
 * selected voice is local or backed by an online speech service.
 */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// Chromium loads the voice list asynchronously: the first getVoices() call
// often returns [] and the real list arrives via 'voiceschanged'. Cache it.
// (Even with no picked voice, utterance.lang still lets the engine choose —
// the cache just upgrades voice quality once the list is in.)
let cachedVoices: SpeechSynthesisVoice[] = [];
const refreshVoices = (): void => {
  try {
    cachedVoices = window.speechSynthesis?.getVoices?.() ?? [];
  } catch {
    cachedVoices = [];
  }
};

/** Call once on plugin load: primes the voice cache and tracks updates. */
export function initSpeech(): void {
  if (!isSpeechSupported()) return;
  refreshVoices();
  try {
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  } catch { /* older engines: cache refreshes lazily in pickVoice */ }
}

/** Call on plugin unload: stop speech and detach the voiceschanged listener. */
export function disposeSpeech(): void {
  stopSpeech();
  try {
    window.speechSynthesis?.removeEventListener?.('voiceschanged', refreshVoices);
  } catch { /* ignore */ }
}

/** Best available voice for a BCP-47 lang: exact match → base-language match. */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) refreshVoices();
  const voices = cachedVoices;
  if (voices.length === 0) return null;
  const want = lang.toLowerCase();
  const base = want.split('-')[0]!;
  return (
    voices.find((v) => v.lang?.toLowerCase() === want)
    ?? voices.find((v) => v.lang?.toLowerCase().startsWith(base))
    ?? null
  );
}

/**
 * Speak `text` in `lang` (BCP-47, e.g. 'en', 'ja', 'fr-FR'). Cancels any
 * in-progress utterance first so rapid clicks don't stack. No-op when speech
 * synthesis is unavailable.
 */
export function speakText(text: string, lang = 'en'): void {
  if (!text || !isSpeechSupported()) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    synth.speak(utterance);
  } catch {
    /* best-effort — pronunciation must never block the UI */
  }
}

/** Stop any in-progress speech. */
export function stopSpeech(): void {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
