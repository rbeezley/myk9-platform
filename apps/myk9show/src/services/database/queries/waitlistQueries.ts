/**
 * Waitlist Management Queries
 *
 * Database queries for managing class waitlists for trial secretaries.
 * Uses the waitlist_entries table for waitlist tracking and entries table for accepted entries.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

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
    trial_date: string | null;
  } | null;
  accepted_count: number;
  waitlist_count: number;
}

/**
 * Get all waitlisted entries for a show
 */
export const getWaitlistByShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    // First get all classes for the show's trials
    const { data: trials, error: trialsError } = await supabase
      .from('trials')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trials', 'get_trials_for_waitlist');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get classes for these trials
    const { data: classes, error: classesError } = await supabase
      .from('classes')
      .select('id')
      .in('trial_id', trialIds);

    if (classesError) {
      throw createDatabaseError(classesError, 'classes', 'get_classes_for_waitlist');
    }

    const classIds = classes?.map((c) => c.id) || [];

    if (classIds.length === 0) {
      return { data: [], error: null };
    }

    // Get waitlist entries for these classes
    const { data, error } = await supabase
      .from('waitlist_entries')
      .select(`
        id,
        class_id,
        dog_id,
        exhibitor_id,
        handler_id,
        position,
        status,
        offered_at,
        offer_expires_at,
        created_at,
        updated_at,
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
      `)
      .in('class_id', classIds)
      .order('position', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_by_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'waitlist_entries', 'get_waitlist_by_show');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'get_waitlist_by_show');
    logQuery('waitlist_entries', 'get_waitlist_by_show', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get waitlisted entries for a specific class
 */
export const getWaitlistByClass = async (classId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('waitlist_entries')
      .select(`
        id,
        class_id,
        dog_id,
        exhibitor_id,
        handler_id,
        position,
        status,
        offered_at,
        offer_expires_at,
        created_at,
        updated_at,
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
      `)
      .eq('class_id', classId)
      .order('position', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_by_class', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'waitlist_entries', 'get_waitlist_by_class');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'waitlist_entries', 'get_waitlist_by_class');
    logQuery('waitlist_entries', 'get_waitlist_by_class', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get classes with waitlist counts for a show
 */
export const getClassesWithWaitlistCounts = async (showId: string) => {
  const startTime = Date.now();

  try {
    // First get all classes for the show's trials
    const { data: trials, error: trialsError } = await supabase
      .from('trials')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trials', 'get_trials_for_waitlist');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get classes with counts
    // Note: class_number column exists but Supabase types need regeneration
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        max_entries,
        trial_id,
        trial:trial_id (
          id,
          name,
          trial_date
        )
      `)
      .in('trial_id', trialIds)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (classError) {
      throw createDatabaseError(classError, 'classes', 'get_classes_for_waitlist');
    }

    // Get counts for each class
    const classesWithCounts = await Promise.all(
      (classes || []).map(async (cls) => {
        // Get accepted count from entries table
        const { count: acceptedCount } = await supabase
          .from('entries')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .eq('entry_status', 'accepted')
          .is('deleted_at', null);

        // Get waitlist count from waitlist_entries table
        const { count: waitlistCount } = await supabase
          .from('waitlist_entries')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id);

        return {
          ...cls,
          accepted_count: acceptedCount || 0,
          waitlist_count: waitlistCount || 0,
        };
      })
    );

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
      .select(`
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
      `)
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
 * Get waitlist position for a specific entry (uses the position column directly)
 */
export const getWaitlistPosition = async (waitlistEntryId: string) => {
  const startTime = Date.now();

  try {
    const { data: entry, error: entryError } = await supabase
      .from('waitlist_entries')
      .select('position')
      .eq('id', waitlistEntryId)
      .single();

    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_position', duration, entryError?.message);

    if (entryError || !entry) {
      return { position: null, error: entryError };
    }

    return { position: entry.position, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    logQuery('waitlist_entries', 'get_waitlist_position', duration, (error as Error).message);
    return { position: null, error };
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
      .select(`
        id,
        class_id,
        dog_id,
        exhibitor_id,
        handler_id,
        class:class_id (
          trial_id,
          entry_fee
        )
      `)
      .eq('id', waitlistEntryId)
      .eq('status', 'offered')
      .single();

    if (fetchError || !waitlistEntry) {
      throw createDatabaseError(fetchError || new Error('Waitlist entry not found or not offered'), 'waitlist_entries', 'accept_waitlist_offer');
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
        entry_status: 'accepted',
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
    await supabase
      .from('waitlist_entries')
      .delete()
      .eq('id', waitlistEntryId);

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
