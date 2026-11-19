/**
 * Whose rows the clubs replica holds (MYK9-2168).
 *
 * Written only by the identity boundary, after a full pull under that account
 * has been confirmed to still be the signed-in account. Removed before the
 * replica is cleared, so an interrupted clear leaves no marker and the next
 * boot clears again. Unreadable or missing means "unknown owner": the replica
 * is cleared, never trusted.
 */

const MARKER_KEY = 'myk9:clubs-replica-principal';

export type ReplicaPrincipal = { state: 'known'; key: string } | { state: 'unknown' };

export function readReplicaPrincipal(): ReplicaPrincipal {
  try {
    const value = window.localStorage.getItem(MARKER_KEY);
    return value ? { state: 'known', key: value } : { state: 'unknown' };
  } catch {
    return { state: 'unknown' };
  }
}

/** False when the marker could not be stored: the caller must not call the replica verified. */
export function writeReplicaPrincipal(key: string): boolean {
  try {
    window.localStorage.setItem(MARKER_KEY, key);
    return window.localStorage.getItem(MARKER_KEY) === key;
  } catch {
    return false;
  }
}

/** False when the marker could not be removed: the caller must not clear rows under it. */
export function clearReplicaPrincipal(): boolean {
  try {
    window.localStorage.removeItem(MARKER_KEY);
    return window.localStorage.getItem(MARKER_KEY) === null;
  } catch {
    return false;
  }
}
