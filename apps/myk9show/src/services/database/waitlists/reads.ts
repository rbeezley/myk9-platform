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
import { buildMapFromArray } from '../queries/queryUtils';

export interface WaitlistEntry {
  id: string;
  class_id: string;
  dog_id: string;
  exhibitor_id: string;
  handler_id: string | null;
  position: number;
  status: string | null;
  offered_at: string | null;
  offer_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  // Joined data
  dog: {
    id: string;
    name: string;
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
 * Get all waitlisted entries for a show
 * Replication-first with PostgREST fallback.
 */
export const getWaitlistByShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get trials for the show from replication
    const trials = await replicatedTrialsTable.getTrialsByShow(showId);
    const trialIds = trials.map(t => t.id);

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get classes for these trials
    const allClasses = await Promise.all(
      trialIds.map(tid => replicatedClassesTable.getClassesByTrial(tid))
    );
    const classes = allClasses.flat();
    const classIds = new Set(classes.map(c => c.id));

    if (classIds.size === 0) {
      return { data: [], error: null };
    }

    // Get waitlist entries for these classes
    const allWaitlist = await Promise.all(
      [...classIds].map(cid => replicatedWaitlistEntriesTable.getByClass(cid))
    );
    const waitlistEntries = allWaitlist.flat();

    // Build lookup maps
    const classesMap = buildMapFromArray(classes, c => c.id);
    const dogIds = [...new Set(waitlistEntries.map(e => e.dogId))];
    const dogs = await Promise.all(dogIds.map(did => replicatedDogsTable.getDogById(did)));
    const dogsMap = new Map(
      dogIds.map((did, i) => [did, dogs[i]] as const).filter(([, d]) => d !== null)
    );

    // Map and sort by position
    const data = waitlistEntries
      .map(entry =>
        mapWaitlistEntry(
          entry,
          dogsMap.get(entry.dogId) ?? null,
          classesMap.get(entry.classId) ?? null
        )
      )
      .sort((a, b) => a.position - b.position);

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_by_show', duration);

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'get_waitlist_by_show');
    logQuery('waitlist_entries', 'get_waitlist_by_show', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get waitlisted entries for a specific class
 * Replication-first with PostgREST fallback.
 */
export const getWaitlistByClass = async (classId: string) => {
  const startTime = Date.now();

  try {
    const waitlistEntries = await replicatedWaitlistEntriesTable.getByClass(classId);

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
      replicatedEntriesTable.getAll(),
      replicatedWaitlistEntriesTable.getAll(),
    ]);

    const classesWithCounts = classes.map(cls => {
      const acceptedCount = allEntries.filter(
        e => e.classId === cls.id && e.entryStatus === 'accepted'
      ).length;
      const waitlistCount = allWaitlist.filter(w => w.classId === cls.id).length;

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

/**
 * Offer a waitlist spot (update status to 'offered' and set expiration)
 */
export const offerWaitlistSpot = async (waitlistEntryId: string, expirationHours: number = 24) => {
  const startTime = Date.now();

  try {
    const offerExpiration = new Date();
    offerExpiration.setHours(offerExpiration.getHours() + expirationHours);

    const { data, error } = await supabase
      .from('waitlist_entries')
      .update({
        status: 'offered',
        offered_at: new Date().toISOString(),
        offer_expires_at: offerExpiration.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', waitlistEntryId)
      .select(
        `
        id,
        class_id,
        dog_id,
        exhibitor_id,
        status,
        offered_at,
        offer_expires_at,
        dog:dog_id (
          id,
          name,
          call_name
        ),
        class:class_id (
          id,
          name,
          class_number
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'offer_waitlist_spot', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'waitlist_entries', 'offer_waitlist_spot');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'offer_waitlist_spot');
    logQuery('waitlist_entries', 'offer_waitlist_spot', duration, dbError.message);
    return { data: null, error: dbError };
  }
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

/**
 * Get waitlist position for a specific entry
 * Replication-first with PostgREST fallback.
 */
export const getWaitlistPosition = async (waitlistEntryId: string) => {
  const startTime = Date.now();

  try {
    const entry = await replicatedWaitlistEntriesTable.getById(waitlistEntryId);

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_position', duration);

    if (!entry) {
      return { position: null, error: null };
    }

    return { position: entry.position, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_position', duration, (error as Error).message);
    return { position: null, error };
  }
};

/**
 * Join the waitlist for a class (exhibitor-facing)
 * Calculates the next position and inserts a new waitlist entry.
 */
export const joinWaitlist = async (
  classId: string,
  dogId: string,
  exhibitorId: string,
  handlerId?: string | null
) => {
  const startTime = Date.now();

  try {
    // Get current max position for this class
    const { data: existing, error: posError } = await supabase
      .from('waitlist_entries')
      .select('position')
      .eq('class_id', classId)
      .order('position', { ascending: false })
      .limit(1);

    if (posError) {
      throw createDatabaseError(posError, 'waitlist_entries', 'join_waitlist_position');
    }

    const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 1;

    const { data, error } = await supabase
      .from('waitlist_entries')
      .insert({
        class_id: classId,
        dog_id: dogId,
        exhibitor_id: exhibitorId,
        handler_id: handlerId || null,
        position: nextPosition,
        status: 'waiting',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(
        `
        id,
        class_id,
        dog_id,
        exhibitor_id,
        handler_id,
        position,
        status,
        created_at,
        dog:dog_id (
          id,
          name,
          call_name
        ),
        class:class_id (
          id,
          name,
          class_number,
          max_entries
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'join_waitlist', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'waitlist_entries', 'join_waitlist');
    }

    return { data, error: null, position: nextPosition };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'join_waitlist');
    logQuery('waitlist_entries', 'join_waitlist', duration, dbError.message);
    return { data: null, error: dbError, position: null };
  }
};

/**
 * Accept a waitlist offer - creates an entry and removes from waitlist
 */
export const acceptWaitlistOffer = async (waitlistEntryId: string) => {
  const startTime = Date.now();

  try {
    // Get the waitlist entry details
    const { data: waitlistEntry, error: fetchError } = await supabase
      .from('waitlist_entries')
      .select(
        `
        id,
        class_id,
        dog_id,
        exhibitor_id,
        handler_id,
        class:class_id (
          trial_id,
          entry_fee
        )
      `
      )
      .eq('id', waitlistEntryId)
      .eq('status', 'offered')
      .single();

    if (fetchError || !waitlistEntry) {
      throw createDatabaseError(
        fetchError || new Error('Waitlist entry not found or not offered'),
        'waitlist_entries',
        'accept_waitlist_offer'
      );
    }

    // Create the entry
    const classData = waitlistEntry.class as { trial_id: string; entry_fee: number | null } | null;
    const { data: newEntry, error: insertError } = await supabase
      .from('entries')
      .insert({
        class_id: waitlistEntry.class_id,
        dog_id: waitlistEntry.dog_id,
        handler_id: waitlistEntry.handler_id,
        ...(classData?.trial_id !== undefined && { trial_id: classData.trial_id }),
        entry_status: 'confirmed',
        payment_status: 'pending',
        ...(classData?.entry_fee !== undefined && { entry_fee: classData.entry_fee }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      throw createDatabaseError(insertError, 'entries', 'accept_waitlist_offer_insert');
    }

    // Remove from waitlist
    await supabase.from('waitlist_entries').delete().eq('id', waitlistEntryId);

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'accept_waitlist_offer', duration);

    return { data: newEntry, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'accept_waitlist_offer');
    logQuery('waitlist_entries', 'accept_waitlist_offer', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
