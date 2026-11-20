import { logger } from '@/services/LoggingService';
import { useUserStore } from '@/store/userStore';
import {
  clearRedactionPending,
  isRedactionPending,
  setRedactionPending,
} from '@/store/userStoreContactRedaction';

/**
 * MYK9-2255: on sign-out the saved people directory and the device's own show-desk
 * people rows lose phone, email and address; names stay. Never throws, so sign-out
 * always completes. When either removal fails, a marker stays and
 * `retryPendingPeopleRedaction` runs it again before the next directory load.
 * The next online management sign-in reloads the directory with contact details.
 */
export async function redactPeopleContactsOnDevice(): Promise<void> {
  setRedactionPending();
  let directoryDone = false;
  let rowsDone = false;
  try {
    directoryDone = await useUserStore.getState().redactContacts();
  } catch (error) {
    logger.error(
      'Could not remove contact details from the saved directory',
      'auth',
      {},
      error as Error
    );
  }
  try {
    const { replicatedShowDeskPeopleTable } =
      await import('@/services/replication/ReplicatedShowDeskPeopleTable');
    await replicatedShowDeskPeopleTable.redactSentContacts();
    rowsDone = true;
  } catch (error) {
    logger.error(
      'Could not remove contact details from show-desk people rows',
      'auth',
      {},
      error as Error
    );
  }
  if (directoryDone && rowsDone) clearRedactionPending();
}

/** Runs a removal that failed at sign-out. A no-op when none is pending. */
export async function retryPendingPeopleRedaction(): Promise<void> {
  if (isRedactionPending()) await redactPeopleContactsOnDevice();
}
