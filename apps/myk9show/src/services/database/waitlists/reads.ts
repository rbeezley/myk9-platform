/**
 * Waitlist Management Queries
 *
 * Database queries for managing class waitlists for trial secretaries.
 * SELECT queries use replication-first with PostgREST fallback.
 * Mutations (INSERT/UPDATE/DELETE) stay on PostgREST.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { replicatedWaitlistEntriesTable } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import {
  deleteWaitlistEntryAndEvict,
  WaitlistEntryNotDeletedError,
  WAITLIST_ENTRY_GONE_MESSAGE,
} from './deleteWaitlistEntry';
import {
  mapWaitlistEntry,
  mapClassWithWaitlistCount,
  waitlistClassDisplayName,
} from '@/services/mappers/waitlistMappers';
import { refreshWaitlistEntryInReplica } from './offerActions';
import { buildMapFromArray } from '../_shared/maps';
import {
  countQueuedWaitlistEntries,
  countSeatHoldingEntries,
  filterOfferedWaitlistEntries,
  filterQueuedWaitlistEntries,
} from '@/utils/waitlistCountSelectors';

export interface WaitlistEntry {
  id: string;
  class_id: string;
  dog_id: string;
  exhibitor_id: string;
  handler_id: string | null;
  position: number;
  status: string | null;
  joined_via: 'online' | 'mail_in' | null;
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Joined data
  dog: {
    id: string;
    // MYK9-90 §5.2 — `dogs.name` is a nullable legacy alias. `call_name` is the
    // required identifier; render that and fall back to `name` only when it
    // says something different.
    name: string | null;
    call_name: string | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    max_entries: number | null;
  } | null;
}

export interface ClassWithWaitlistCount {
  id: string;
  name: string;
  class_number: string | null;
  max_entries: number | null;
  trial_id: string;
  trial: {
    id: string;
    name: string | null;
    date: string | null;
    /** The trial's IANA zone, when the replica has one (offer deadlines read in it). */
    timezone?: string | null;
  } | null;
  accepted_count: number;
  waitlist_count: number;
  /** Open offers (status 'offered'), so a class whose queue is empty still shows them. */
  offered_count?: number;
}

/**
 * An open offer on the Waitlist tab (MYK9-1001): the row, plus what the
 * secretary needs to track it. An offered row is waiting for payment by
 * definition (a payment resolves it to 'accepted'); `promoted_entry_paid` is
 * the short window in which the money has landed and the offer is being
 * resolved.
 */
export interface WaitlistOffer extends WaitlistEntry {
  promoted_entry_paid: boolean;
  trial_timezone: string | null;
  /** Which trial: shows repeat a class across trials, so the class name alone is ambiguous. */
  trial_name: string | null;
  trial_date: string | null;
}

/**
 * Get waitlisted entries for a specific class
 * Replication-first with PostgREST fallback.
 */
export const getWaitlistByClass = async (classId: string) => {
  const startTime = Date.now();

  try {
    const waitlistEntries = filterQueuedWaitlistEntries(
      await replicatedWaitlistEntriesTable.getByClass(classId)
    );

    // Look up class once
    const cls = await replicatedClassesTable.getClassById(classId);

    // Look up dogs
    const dogIds = [...new Set(waitlistEntries.map(e => e.dogId))];
    const dogs = await Promise.all(dogIds.map(did => replicatedDogsTable.getDogById(did)));
    const dogsMap = new Map(
      dogIds.map((did, i) => [did, dogs[i]] as const).filter(([, d]) => d !== null)
    );

    const data = waitlistEntries
      .map(entry => mapWaitlistEntry(entry, dogsMap.get(entry.dogId) ?? null, cls))
      .sort((a, b) => a.position - b.position);

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_by_class', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'get_waitlist_by_class');
    logQuery('waitlist_entries', 'get_waitlist_by_class', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Open offers (status 'offered') for a class, oldest offer first.
 * Replica only, like the queue: an offer made from this tab lands in the
 * replica through the same subscription that refreshes the queue.
 */
export const getWaitlistOffersByClass = async (classId: string) => {
  const startTime = Date.now();

  try {
    const offered = filterOfferedWaitlistEntries(
      await replicatedWaitlistEntriesTable.getByClass(classId)
    );
    if (offered.length === 0) return { data: [] as WaitlistOffer[], error: null };

    const cls = await replicatedClassesTable.getClassById(classId);
    const trial = cls?.trialId ? await replicatedTrialsTable.getTrialById(cls.trialId) : null;
    const [dogs, promotedEntries] = await Promise.all([
      Promise.all(offered.map(o => replicatedDogsTable.getDogById(o.dogId))),
      Promise.all(
        offered.map(o =>
          o.promotedEntryId ? replicatedEntriesTable.getEntryById(o.promotedEntryId) : null
        )
      ),
    ]);

    const data = offered
      .map((offer, i): WaitlistOffer => {
        const mapped = mapWaitlistEntry(offer, dogs[i] ?? null, cls);
        return {
          ...mapped,
          // The same class name the queue cards show.
          class:
            mapped.class && cls ? { ...mapped.class, name: waitlistClassDisplayName(cls) } : null,
          promoted_entry_paid: promotedEntries[i]?.paymentStatus === 'paid',
          trial_timezone: trial?.timezone ?? null,
          trial_name: trial?.name ?? null,
          trial_date: trial?.date ?? null,
        };
      })
      .sort((a, b) => (a.offered_at ?? '').localeCompare(b.offered_at ?? ''));

    logQuery('waitlist_entries', 'get_waitlist_offers_by_class', Date.now() - startTime);
    return { data, error: null };
  } catch (error) {
    const dbError = createDatabaseError(error, 'waitlist_entries', 'get_waitlist_offers_by_class');
    logQuery(
      'waitlist_entries',
      'get_waitlist_offers_by_class',
      Date.now() - startTime,
      dbError.message
    );
    return { data: [] as WaitlistOffer[], error: dbError };
  }
};

/**
 * Get classes with waitlist counts for a show
 * Replication-first with PostgREST fallback.
 */
export const getClassesWithWaitlistCounts = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get trials for the show
    const trials = await replicatedTrialsTable.getTrialsByShow(showId);
    const trialIds = trials.map(t => t.id);

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Build trial lookup map
    const trialsMap = buildMapFromArray(trials, t => t.id);

    // Get classes for these trials
    const allClasses = await Promise.all(
      trialIds.map(tid => replicatedClassesTable.getClassesByTrial(tid))
    );
    const classes = allClasses.flat();

    // Batch-load all entries and waitlist entries once, count per class in JS
    const [allEntries, allWaitlist] = await Promise.all([
      replicatedEntriesTable.getAllOrThrow(),
      replicatedWaitlistEntriesTable.getAllOrThrow(),
    ]);

    const classesWithCounts = classes.map(cls => {
      const acceptedCount = countSeatHoldingEntries(allEntries.filter(e => e.classId === cls.id));
      const classWaitlist = allWaitlist.filter(w => w.classId === cls.id);
      const waitlistCount = countQueuedWaitlistEntries(classWaitlist);

      return mapClassWithWaitlistCount(
        cls,
        trialsMap.get(cls.trialId ?? '') ?? null,
        acceptedCount,
        waitlistCount,
        filterOfferedWaitlistEntries(classWaitlist).length
      );
    });

    // Sort by name
    classesWithCounts.sort((a, b) => a.name.localeCompare(b.name));

    const duration = Date.now() - startTime;
    logQuery('classes', 'get_classes_with_waitlist_counts', duration);

    return { data: classesWithCounts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'classes', 'get_classes_with_waitlist_counts');
    logQuery('classes', 'get_classes_with_waitlist_counts', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/** What `send_waitlist_offer_message` did (MYK9-1003). */
export type WaitlistOfferMessageOutcome = 'sent' | 'not_offered' | 'no_account' | 'no_sender';

/**
 * Send the offered exhibitor the in-app offer message, from the signed-in
 * secretary. The database writes it (thread + message, whose insert sends the
 * chat push) through the same function an automatic offer uses, so both paths
 * send the same message (MYK9-1003).
 */
export const sendWaitlistOfferMessage = async (
  waitlistEntryId: string,
  paymentLinkUrl: string | null
): Promise<WaitlistOfferMessageOutcome> => {
  const args: { p_waitlist_entry_id: string; p_payment_link_url?: string } = {
    p_waitlist_entry_id: waitlistEntryId,
  };
  if (paymentLinkUrl) {
    args.p_payment_link_url = paymentLinkUrl;
  }

  const { data, error } = await supabase.rpc('send_waitlist_offer_message', args);

  if (error) {
    throw createDatabaseError(error, 'show_messages', 'send_waitlist_offer_message');
  }

  return data as WaitlistOfferMessageOutcome;
};

/**
 * Remove from waitlist (delete the waitlist entry)
 */
export const removeFromWaitlist = async (waitlistEntryId: string) => {
  const startTime = Date.now();

  try {
    // Evicts the replica row only when the server confirms the delete, so the
    // queue, counts and report agree without waiting for a sync (MYK9-1000).
    await deleteWaitlistEntryAndEvict(waitlistEntryId, WAITLIST_ENTRY_GONE_MESSAGE);
    logQuery('waitlist_entries', 'remove_from_waitlist', Date.now() - startTime);
    return { data: { id: waitlistEntryId }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    // Nothing was deleted: say so plainly rather than as a database failure.
    const dbError =
      error instanceof WaitlistEntryNotDeletedError
        ? error
        : createDatabaseError(error, 'waitlist_entries', 'remove_from_waitlist');
    logQuery('waitlist_entries', 'remove_from_waitlist', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export const promoteWaitlistEntry = async (
  waitlistEntryId: string,
  deadlineHours?: number
): Promise<string> => {
  const args: { p_waitlist_entry_id: string; p_deadline_hours?: number } = {
    p_waitlist_entry_id: waitlistEntryId,
  };
  if (deadlineHours !== undefined) {
    args.p_deadline_hours = deadlineHours;
  }

  const { data, error } = await supabase.rpc('promote_waitlist_entry', args);

  if (error) {
    throw createDatabaseError(error, 'waitlist_entries', 'promote_waitlist_entry');
  }

  // The offered row moves to the tab's Offered group now, not at the next sync (MYK9-1001).
  await refreshWaitlistEntryInReplica(waitlistEntryId);

  return data as string;
};

export const bulkPromoteWaitlistEntries = async (
  waitlistEntryIds: string[],
  deadlineHours?: number
): Promise<string[]> => {
  const settled = await Promise.allSettled(
    waitlistEntryIds.map(id => promoteWaitlistEntry(id, deadlineHours))
  );

  const succeeded = settled
    .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
    .map(result => result.value);

  const realFailures = settled
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .filter(result => !String(result.reason?.message).includes('not available for promotion'));

  if (realFailures.length > 0) {
    throw new Error(
      `${realFailures.length} of ${waitlistEntryIds.length} promotion(s) failed: ${realFailures[0].reason?.message}`
    );
  }

  return succeeded;
};

export const closeWaitlistForClasses = async (classIds: string[]): Promise<void> => {
  const { error } = await supabase
    .from('waitlist_entries')
    .update({ status: 'expired' })
    .in('class_id', classIds)
    .eq('status', 'waiting');

  if (error) {
    throw createDatabaseError(error, 'waitlist_entries', 'close_waitlist_for_classes');
  }
};

/**
 * Join the waitlist for a class (exhibitor-facing)
 * Calculates the next position and inserts a new waitlist entry.
 */
