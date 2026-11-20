import type { User } from '@/types/user-types';

/**
 * MYK9-2255 (owner decision 3, 2026-11-19): a signed-out device keeps the people
 * directory's names and none of its contact details. These are the pure
 * redactions; `signOutPeopleContact` decides when they run.
 */

/** The persisted key of `useUserStore` (zustand `persist` name). */
export const USER_STORE_STORAGE_NAME = 'myk9show-user-storage';

/** A person without phone, email, address or emergency contact. Names, ids and roles stay. */
export function stripUserContact<T extends User>(user: T): T {
  return {
    ...user,
    email: undefined,
    phone: undefined,
    address: undefined,
    streetAddress: undefined,
    city: undefined,
    state: undefined,
    zipCode: undefined,
    country: undefined,
    emergencyContact: undefined,
  };
}

export function stripUsersContact<T extends User>(users: readonly T[]): T[] {
  return users.map(stripUserContact);
}

/**
 * The persisted `{ state: { users }, version }` JSON with every person's contact
 * details removed. Returns null for anything it cannot read, so a caller never
 * writes back a value it did not understand.
 */
export function stripPersistedUserStore(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { state?: { users?: User[] } } | null;
    const users = parsed?.state?.users;
    if (!parsed || !Array.isArray(users)) return null;
    return JSON.stringify({
      ...parsed,
      state: { ...parsed.state, users: stripUsersContact(users) },
    });
  } catch {
    return null;
  }
}

/** A person added at the desk, reduced to the name once the server has it. */
export function stripShowDeskPersonContact<
  T extends {
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  },
>(person: T): T {
  return {
    ...person,
    email: null,
    phone: null,
    address: null,
    city: null,
    state: null,
    zipCode: null,
  };
}
