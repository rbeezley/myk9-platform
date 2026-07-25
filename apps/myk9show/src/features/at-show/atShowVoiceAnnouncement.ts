/**
 * Speaks the 30-second timer warning via the Web Speech API. Isolated in its
 * own module so the scoresheet page doesn't need to touch `speechSynthesis`
 * directly and so this can be mocked cleanly in tests.
 */
export function speakRemainingSeconds(secondsRemaining: number): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(`${secondsRemaining} seconds remaining`);
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}
