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

function readMuted(): boolean {
  try {
    const stored = localStorage.getItem(AUDIO_MUTE_KEY);
    if (stored !== null) return stored === 'true';
  } catch {
    // Storage unreadable — fall through to the in-memory value.
  }
  return memoryMuted;
}

function writeMuted(muted: boolean): void {
  memoryMuted = muted;
  try {
    localStorage.setItem(AUDIO_MUTE_KEY, String(muted));
  } catch {
    // Storage unavailable — the preference won't persist, but memoryMuted above
    // keeps it effective for this session.
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
