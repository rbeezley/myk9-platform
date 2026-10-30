import { speakWithConfig } from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';

/** The phrase the scoresheet speaks; Settings > Test Voice speaks the same one. */
export function remainingSecondsPhrase(secondsRemaining: number): string {
  return `${secondsRemaining} seconds remaining`;
}

/**
 * Speaks the 30-second timer warning through the shared notification speech
 * path, using the voice, speed and on/off the user saved in Settings. A saved
 * voice this device doesn't have falls back to the default voice inside
 * `speakWithConfig`. Isolated so the scoresheet page can mock it in tests.
 */
export function speakRemainingSeconds(secondsRemaining: number): void {
  const { voiceEnabled, voiceName, voiceRate } = useNotificationStore.getState().preferences;
  if (!voiceEnabled) return;
  speakWithConfig(remainingSecondsPhrase(secondsRemaining), { voiceName, voiceRate });
}
