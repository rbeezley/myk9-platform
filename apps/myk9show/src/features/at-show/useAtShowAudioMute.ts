import { useCallback, useSyncExternalStore } from 'react';

const AUDIO_MUTE_KEY = 'at-show-audio-muted';
const AUDIO_MUTE_CHANGED_EVENT = 'myk9:at-show-audio-mute-changed';

function readMuted(): boolean {
  try {
    return localStorage.getItem(AUDIO_MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(AUDIO_MUTE_KEY, String(muted));
  } catch {
    // Storage unavailable (private mode, quota) — mute preference just won't persist.
  }
  window.dispatchEvent(new Event(AUDIO_MUTE_CHANGED_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(AUDIO_MUTE_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(AUDIO_MUTE_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * Whether the ringside timer chime/voice announcements are muted. Persisted
 * so a steward working a quiet indoor venue doesn't have to re-mute every
 * scoresheet visit. Cross-tab synced the same way dog favorites are
 * (`ringsideDogFavorites.ts`).
 */
export function useAtShowAudioMute(): [boolean, () => void] {
  const muted = useSyncExternalStore(subscribe, readMuted, () => false);
  const toggle = useCallback(() => writeMuted(!readMuted()), []);
  return [muted, toggle];
}
