import type { User } from '@/types/user-types';
import { DIRECTORY_ONLY_CONTACT_KEYS, SHARED_CONTACT_KEYS } from '@/utils/personContactKeys';

/**
 * MYK9-2255: the saved people directory keeps names but never contact details
 * past a sign-out. Everything here is the pure or module-level half of that, so
 * the store and the sign-out handler share one definition.
 */

/** Set before a sign-out strip, cleared once the stripped copy is saved. */
const PENDING_MARKER_KEY = 'myk9show-people-redaction-pending';

const CONTACT_KEYS: readonly (keyof User)[] = [
  ...SHARED_CONTACT_KEYS,
  ...DIRECTORY_ONLY_CONTACT_KEYS,
];

export function stripPersonContacts(person: User): User {
  const kept = { ...person };
  for (const key of CONTACT_KEYS) delete kept[key];
  return kept;
}

/** A store update with contact details removed from any directory list it carries. */
export function withoutContacts<T extends { users?: User[]; people?: User[] }>(next: T): T {
  return {
    ...next,
    ...(next.users && { users: stripPeopleContacts(next.users) }),
    ...(next.people && { people: stripPeopleContacts(next.people) }),
  };
}

export function stripPeopleContacts(users: readonly User[]): User[] {
  return users.map(stripPersonContacts);
}

/**
 * Counts sign-outs this page has seen. A directory load records it when it
 * starts and writes nothing if it moved, so a load running at sign-out cannot
 * put contact details back.
 */
let signOutGeneration = 0;
export const currentSignOutGeneration = (): number => signOutGeneration;
export const bumpSignOutGeneration = (): number => ++signOutGeneration;

/** The sign-out count at the last directory load that was allowed to write. */
let loadedGeneration = 0;
export const markDirectoryLoaded = (generation: number): void => {
  loadedGeneration = generation;
};

/**
 * True from a sign-out until the next successful management load, and while a
 * removal is still pending. Every directory write checks it, so no writer
 * (add, update, revert, legacy setters) can put contact details back.
 */
export function mustStripContacts(): boolean {
  return signOutGeneration > loadedGeneration || isRedactionPending();
}

export function isRedactionPending(): boolean {
  try {
    return localStorage.getItem(PENDING_MARKER_KEY) !== null;
  } catch {
    return false;
  }
}

export function setRedactionPending(): void {
  try {
    localStorage.setItem(PENDING_MARKER_KEY, '1');
  } catch {
    // Storage unavailable: the in-memory strip still runs, and sign-out completes.
  }
}

export function clearRedactionPending(): void {
  try {
    localStorage.removeItem(PENDING_MARKER_KEY);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
