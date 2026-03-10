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
 * Cancels any in-progress speech.
 */
export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  speechSynthesis.cancel();
}
