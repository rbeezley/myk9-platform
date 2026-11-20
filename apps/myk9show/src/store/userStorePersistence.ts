import type { StateStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { logger } from '@/services/LoggingService';
import {
  isPeopleContactPurgePending,
  isPeopleContactSealed,
} from '@/services/database/users/peopleContactSeal';
import { stripUsersContact } from '@/services/database/users/peopleContactRedaction';
import type { User } from '@/types/user-types';

/**
 * The saved directory is a cache (the live store holds the current value), so a
 * failed write is logged, not an unhandled rejection. The sign-out removal does
 * its own write and reports its own failure (MYK9-2255).
 */
export function getUsersStorage(): StateStorage {
  const base = getOptimalStorage('users');
  return {
    ...base,
    getItem: name => base.getItem(name),
    removeItem: name => base.removeItem(name),
    setItem: async (name, value) => {
      try {
        await base.setItem(name, value);
      } catch (error) {
        logger.warn('Could not save the people directory', 'store', { error });
      }
    },
  };
}

/**
 * Rehydration merge. `people` is not persisted, so it is rebuilt from `users`.
 * MYK9-2255: a rehydration after sign-out (or before an unconfirmed removal has
 * run again) must not bring contact details back.
 */
export function mergePersistedUsers<S extends { users: User[]; people: User[] }>(
  persisted: Partial<S>,
  currentState: S
): S {
  const users =
    persisted.users && (isPeopleContactSealed() || isPeopleContactPurgePending())
      ? stripUsersContact(persisted.users)
      : persisted.users;
  return {
    ...currentState,
    ...persisted,
    ...(users ? { users } : {}),
    people: users ?? currentState.users,
  };
}
