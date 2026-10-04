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
import { mapWaitlistEntry, mapClassWithWaitlistCount } from '@/services/mappers/waitlistMappers';
import { buildMapFromArray } from '../_shared/maps';
import {
  countQueuedWaitlistEntries,
  countSeatHoldingEntries,
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
  } | null;
  accepted_count: number;
  waitlist_count: number;
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
      const waitlistCount = countQueuedWaitlistEntries(
        allWaitlist.filter(w => w.classId === cls.id)
      );

      return mapClassWithWaitlistCount(
        cls,
        trialsMap.get(cls.trialId ?? '') ?? null,
        acceptedCount,
        waitlistCount
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
    const { data, error } = await supabase
      .from('waitlist_entries')
      .delete()
      .eq('id', waitlistEntryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'remove_from_waitlist', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'waitlist_entries', 'remove_from_waitlist');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'remove_from_waitlist');
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
