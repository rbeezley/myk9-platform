import { hasAuthenticatedSession } from '@/services/database/_shared/session';
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
 * always completes.
 *
 * The pending marker covers the DIRECTORY only: it stays when the directory strip
 * fails, and a management load that overwrites the directory settles it. The
 * show-desk strip needs no marker: it is idempotent (a sent row never needs its
 * contact details) and needs no session, so it runs at every sign-out and on every
 * app start, and a failure simply retries at the next of those.
 */
export function redactPeopleContactsOnDevice(): Promise<void> {
  // Every useAuth subscriber hears SIGNED_OUT; they share one run.
  if (!inFlight) {
    runCount += 1;
    inFlight = runRedaction().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

let inFlight: Promise<void> | null = null;
let runCount = 0;

/** The sign-out run in progress, or an already-resolved promise when none is. */
export const peopleRedactionSettled = (): Promise<void> => inFlight ?? Promise.resolve();

/** How many runs have started; lets a test wait for the run a SIGNED_OUT event schedules. */
export const peopleRedactionRunCount = (): number => runCount;

async function runRedaction(): Promise<void> {
  setRedactionPending();
  try {
    if (await useUserStore.getState().redactContacts()) clearRedactionPending();
  } catch (error) {
    logger.error(
      'Could not remove contact details from the saved directory',
      'auth',
      {},
      error as Error
    );
  }
  await redactShowDeskRows();
}

async function redactShowDeskRows(): Promise<void> {
  try {
    const { replicatedShowDeskPeopleTable } =
      await import('@/services/replication/ReplicatedShowDeskPeopleTable');
    await replicatedShowDeskPeopleTable.redactSentContacts();
  } catch (error) {
    logger.error(
      'Could not remove contact details from show-desk people rows',
      'auth',
      {},
      error as Error
    );
  }
}

/**
 * Runs a directory removal that failed at sign-out. A no-op when none is pending,
 * and while a session is signed in: the directory load overwrites the directory
 * then and settles the marker itself.
 */
export async function retryPendingPeopleRedaction(): Promise<void> {
  if (!isRedactionPending()) return;
  if (await hasAuthenticatedSession()) return;
  await redactPeopleContactsOnDevice();
}

/**
 * Once per app start: strips sent show-desk rows (a failed sign-out strip lands
 * here) and retries a pending directory removal. Never throws.
 */
export async function redactPeopleContactsOnStart(): Promise<void> {
  try {
    await retryPendingPeopleRedaction();
    // A directory retry already stripped the rows; the strip is idempotent.
    await redactShowDeskRows();
  } catch (error) {
    logger.error('Could not remove saved contact details at start', 'auth', {}, error as Error);
  }
}
