/**
 * Per-device memory of "this person has entries of their own", for the rail's My Entries item.
 *
 * The entries replica is per show, so an empty read is not proof of no entries, and identity can
 * be unresolved on a cold offline boot. This remembers the last answer so the rail holds it
 * rather than hiding the item on a guess. Storage can throw (private window, blocked site data):
 * the answer is then "nothing remembered", like the other rail memories.
 */

const MEMORY_KEY_PREFIX = 'myk9-has-own-entries:';
/** Set at checkout success, before the paid entry has replicated, and cleared once a read sees it. */
const JUST_ENTERED_KEY = 'myk9-just-entered';

export type OwnEntriesMemory = 'yes' | 'no';

export function readOwnEntriesMemory(personId: string): OwnEntriesMemory | null {
  try {
    const stored = window.localStorage.getItem(`${MEMORY_KEY_PREFIX}${personId}`);
    return stored === 'yes' || stored === 'no' ? stored : null;
  } catch {
    return null;
  }
}

export function writeOwnEntriesMemory(personId: string, answer: OwnEntriesMemory): void {
  try {
    window.localStorage.setItem(`${MEMORY_KEY_PREFIX}${personId}`, answer);
  } catch {
    // A lost memory only means the next unresolved boot fails open instead of holding the answer.
  }
}

/** Checkout success: the entry exists on the server even if this device has not replicated it yet. */
export function markJustEntered(): void {
  try {
    window.localStorage.setItem(JUST_ENTERED_KEY, '1');
  } catch {
    // The replica read still finds the entry once it syncs.
  }
}

export function hasJustEntered(): boolean {
  try {
    return window.localStorage.getItem(JUST_ENTERED_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearJustEntered(): void {
  try {
    window.localStorage.removeItem(JUST_ENTERED_KEY);
  } catch {
    // A marker that outlives its use only keeps the item visible.
  }
}
