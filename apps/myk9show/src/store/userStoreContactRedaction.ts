import type { User } from '@/types/user-types';

/**
 * MYK9-2255: the saved people directory keeps names but never contact details
 * past a sign-out. Everything here is the pure or module-level half of that, so
 * the store and the sign-out handler share one definition.
 */

/** Set before a sign-out strip, cleared once the stripped copy is saved. */
const PENDING_MARKER_KEY = 'myk9show-people-redaction-pending';

export function stripPersonContacts(person: User): User {
  const {
    email: _email,
    phone: _phone,
    address: _address,
    streetAddress: _streetAddress,
    city: _city,
    state: _state,
    zipCode: _zipCode,
    emergencyContact: _emergencyContact,
    ...kept
  } = person;
  return kept;
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
