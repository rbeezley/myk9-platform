/**
 * Checks whether the browser supports SpeechSynthesis.
 */
export function isSpeechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

/**
 * Speaks the given text using the Web Speech API.
 * Cancels any in-progress speech before starting.
 */
export function speak(text: string): void {
  if (!isSpeechSupported()) return;

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  // Chrome bug: small delay after cancel before speaking
  setTimeout(() => {
    speechSynthesis.speak(utterance);
  }, 100);
}

/**
 * Speaks text using the Web Speech API with user-selected voice and rate.
 * Cancels any in-progress speech before starting.
 */
export function speakWithConfig(
  text: string,
  config: { voiceName: string; voiceRate: number }
): void {
  if (!isSpeechSupported()) return;

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

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

  // Chrome bug: small delay after cancel before speaking
  setTimeout(() => {
    speechSynthesis.speak(utterance);
  }, 100);
}

/**
 * Cancels any in-progress speech.
 */
export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  speechSynthesis.cancel();
}
