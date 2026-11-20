import type { PersistStorage } from 'zustand/middleware';
import type { User } from '@/types/user-types';
import { logger } from '@/services/LoggingService';
import { stripPeopleContacts } from './userStoreContactRedaction';

type DirectoryPersist = {
  hasHydrated: () => boolean;
  getOptions: () => {
    name?: string | undefined;
    version?: number | undefined;
    storage?: PersistStorage<unknown> | undefined;
  };
};

const logFailure = (message: string, error: unknown): void =>
  logger.error(message, 'store', {}, error as Error);

/**
 * MYK9-2255: strip phone, email and address from the saved people directory, in
 * memory and in storage; names stay. Resolves false when the strip did not land,
 * so the pending marker stays and the next start runs it again.
 */
export async function redactDirectoryContacts(
  persistApi: DirectoryPersist,
  inMemory: User[],
  setUsers: (users: User[]) => void
): Promise<boolean> {
  const options = persistApi.getOptions();
  const storageName = options.name ?? '';
  let source = inMemory;
  // MYK9-2310: a sign-out before hydration (an expired session at app start) sees an
  // empty directory, so strip the stored copy instead and names are never wiped. The
  // storage adapter turns a failed read into null, so no stored copy means "unknown":
  // write nothing and keep the marker, and the next start strips the hydrated directory.
  if (!persistApi.hasHydrated()) {
    try {
      const stored = await options.storage?.getItem(storageName);
      const storedUsers = (stored?.state as { users?: User[] } | undefined)?.users;
      if (!storedUsers) return false;
      source = storedUsers;
    } catch (error) {
      logFailure('Could not read the saved people directory', error);
      return false;
    }
  }
  const users = stripPeopleContacts(source);
  setUsers(users);
  try {
    await options.storage?.setItem(storageName, {
      state: { users },
      version: options.version ?? 0,
    });
    return true;
  } catch (error) {
    logFailure('Could not save the stripped people directory', error);
    return false;
  }
}
