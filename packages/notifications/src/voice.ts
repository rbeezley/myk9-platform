import type { VoiceConfig } from './types';

let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Until when a priority utterance (the scoresheet's timer warning, MYK9-1510) holds the voice.
 * Ordinary speech (spoken notifications) is skipped while it holds, so a notification can never
 * cancel the judge's warning. Released when the utterance ends or errors; the time bound releases
 * it anyway if a browser never reports the end, so notification speech cannot stay blocked.
 */
const PRIORITY_HOLD_MS = 10_000;
let priorityHeldUntil = 0;

export interface SpeakOptions {
  /** Outranks ordinary speech: cancels it, and ordinary calls are skipped while this one holds. */
  priority?: boolean;
}

/**
 * Checks whether the browser supports SpeechSynthesis.
 */
export function isSpeechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

/**
 * Speaks the given text using the Web Speech API with default voice settings.
 * Cancels any in-progress speech before starting.
 */
export function speak(text: string): void {
  speakWithConfig(text, { voiceName: '', voiceRate: 1 });
}

/**
 * Speaks text using the Web Speech API with user-selected voice and rate.
 * Cancels any in-progress speech before starting.
 */
export function speakWithConfig(
  text: string,
  config: VoiceConfig,
  options: SpeakOptions = {}
): void {
  if (!isSpeechSupported()) return;
  if (!options.priority && Date.now() < priorityHeldUntil) return;

  if (pendingTimeout !== null) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = config.voiceRate;
  utterance.pitch = 1;
  utterance.volume = 1;

  if (config.voiceName) {
    const voices = speechSynthesis.getVoices();
    const match = voices.find(v => v.name === config.voiceName);
    if (match) utterance.voice = match;
  }

  if (options.priority) {
    const heldUntil = Date.now() + PRIORITY_HOLD_MS;
    priorityHeldUntil = heldUntil;
    const release = () => {
      // A later priority utterance owns the hold now; leave it alone.
      if (priorityHeldUntil === heldUntil) priorityHeldUntil = 0;
    };
    utterance.onend = release;
    utterance.onerror = release;
  }

  // Chrome bug: small delay after cancel before speaking
  pendingTimeout = setTimeout(() => {
    pendingTimeout = null;
    speechSynthesis.speak(utterance);
  }, 100);
}
