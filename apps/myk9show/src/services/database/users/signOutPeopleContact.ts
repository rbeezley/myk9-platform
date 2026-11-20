import { useUserStore } from '@/store/userStore';
import { getOptimalStorage } from '@/services/database/storage-adapter';
import { replicatedShowDeskPeopleTable } from '@/services/replication/ReplicatedShowDeskPeopleTable';
import { logger } from '@/services/LoggingService';
import {
  USER_STORE_STORAGE_NAME,
  stripPersistedUserStore,
  stripUsersContact,
} from './peopleContactRedaction';
import {
  beginPeopleContactSeal,
  completePeopleContactPurge,
  isPeopleContactPurgePending,
} from './peopleContactSeal';

/** Every place people are saved on the device, stripped. Resolves false when any step failed. */
async function stripPeopleContactEverywhere(): Promise<boolean> {
  let ok = true;

  // The live store (and, through persist, its next write).
  useUserStore.setState(state => {
    const users = stripUsersContact(state.users);
    return { users, people: users };
  });

  // The saved copy, rewritten directly so it never depends on a store update.
  try {
    const storage = getOptimalStorage('users');
    const raw = await storage.getItem(USER_STORE_STORAGE_NAME);
    if (typeof raw === 'string') {
      const stripped = stripPersistedUserStore(raw);
      if (stripped === null) {
        ok = false;
      } else {
        await storage.setItem(USER_STORE_STORAGE_NAME, stripped);
        // The adapter swallows a quota error and a failed read: only what reads
        // back stripped counts as removed.
        const readBack = await storage.getItem(USER_STORE_STORAGE_NAME);
        if (typeof readBack !== 'string' || stripPersistedUserStore(readBack) !== readBack) {
          ok = false;
        }
      }
    }
  } catch (error) {
    ok = false;
    logger.warn('Could not remove contact details from the saved people directory', 'auth', {
      error,
    });
  }

  // The device's own `people` rows: unsent ones keep everything, sent ones keep the name.
  try {
    await replicatedShowDeskPeopleTable.redactSentContact();
  } catch (error) {
    ok = false;
    logger.warn('Could not remove contact details from the saved desk people', 'auth', { error });
  }

  return ok;
}

/** Sign-out: phone, email and address leave every saved person; names stay. Never throws. */
export async function purgePeopleContactOnSignOut(): Promise<void> {
  beginPeopleContactSeal();
  try {
    if (await stripPeopleContactEverywhere()) completePeopleContactPurge();
  } catch (error) {
    logger.warn('People contact removal failed at sign-out', 'auth', { error });
  }
}

/** Runs the removal again when a previous one was not confirmed. Call before the directory is read. */
export async function ensurePeopleContactPurged(): Promise<void> {
  if (!isPeopleContactPurgePending()) return;
  try {
    if (await stripPeopleContactEverywhere()) completePeopleContactPurge();
  } catch (error) {
    logger.warn('People contact removal retry failed', 'auth', { error });
  }
}
