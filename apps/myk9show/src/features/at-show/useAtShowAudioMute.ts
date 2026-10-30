import { useCallback, useSyncExternalStore } from 'react';

const AUDIO_MUTE_KEY = 'at-show-audio-muted';
const AUDIO_MUTE_CHANGED_EVENT = 'myk9:at-show-audio-mute-changed';

// In-memory fallback for the current session. When localStorage is unavailable
// (private mode, quota, disabled storage), `setItem` throws and the persisted
// value never changes — so without this the toggle would appear dead. Mirroring
// the intended value here keeps mute working for the session even when it can't
// persist. localStorage stays the source of truth whenever it IS readable, so
// normal cross-tab persistence is unaffected.
let memoryMuted = false;
// Latched once a write fails. From that point the persisted value can no longer
// reflect the user's choice, so the in-memory value wins for the rest of the
// session — covering the asymmetric case where reads succeed but writes throw
// (e.g. quota exhausted), which a read-only try/catch would miss.
let memoryFallbackActive = false;

function readMuted(): boolean {
  if (memoryFallbackActive) return memoryMuted;
  try {
    // Storage is readable and writable, so it IS the source of truth —
    // including when the key is absent, which means "no preference" (default
    // unmuted). Falling back to `memoryMuted` here would resurrect a stale
    // preference after the key was removed (e.g. storage cleared elsewhere).
    return localStorage.getItem(AUDIO_MUTE_KEY) === 'true';
  } catch {
    // Storage unreadable (private mode / disabled) — the session-local value
    // is all we have.
    return memoryMuted;
  }
}

function writeMuted(muted: boolean): void {
  memoryMuted = muted;
  try {
    localStorage.setItem(AUDIO_MUTE_KEY, String(muted));
  } catch {
    // Couldn't persist: storage may still be READABLE but now holds a stale or
    // absent value, so switch to the in-memory value for the rest of the
    // session. Without this the toggle would appear dead.
    memoryFallbackActive = true;
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
