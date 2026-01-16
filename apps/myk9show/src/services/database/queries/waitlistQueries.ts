/**
 * Waitlist Management Queries
 *
 * Database queries for managing class waitlists for trial secretaries.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

export interface WaitlistEntry {
  id: string;
  entry_id: string;
  class_id: string;
  trial_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  entry_fee: number | null;
  jump_height: string | null;
  // Joined data
  entry: {
    id: string;
    dog_id: string;
    handler: string | null;
    payment_status: string | null;
    dog: {
      id: string;
      name: string;
      call_name: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    entry_limit: number | null;
  } | null;
}

export interface ClassWithWaitlistCount {
  id: string;
  name: string;
  class_number: string | null;
  entry_limit: number | null;
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
    const { data, error } = await supabase
      .from('class_entry')
      .select(`
        id,
        entry_id,
        class_id,
        trial_id,
        status,
        created_at,
        updated_at,
        entry_fee,
        jump_height,
        entry:entry_id (
          id,
          dog_id,
          handler,
          payment_status,
          dog:dog_id (
            id,
            name,
            call_name
          )
        ),
        class:class_id (
          id,
          name,
          class_number,
          entry_limit
        )
      `)
      .eq('status', 'waitlisted')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    // Filter by show_id through the entry relationship
    // This requires a second query or we filter client-side
    // For now, we'll need to get entries for the show separately

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_waitlist_by_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'get_waitlist_by_show');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'get_waitlist_by_show');
    logQuery('class_entry', 'get_waitlist_by_show', duration, dbError.message);
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
      .from('class_entry')
      .select(`
        id,
        entry_id,
        class_id,
        trial_id,
        status,
        created_at,
        updated_at,
        entry_fee,
        jump_height,
        entry:entry_id (
          id,
          dog_id,
          handler,
          payment_status,
          dog:dog_id (
            id,
            name,
            call_name
          )
        ),
        class:class_id (
          id,
          name,
          class_number,
          entry_limit
        )
      `)
      .eq('class_id', classId)
      .eq('status', 'waitlisted')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_waitlist_by_class', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'get_waitlist_by_class');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'get_waitlist_by_class');
    logQuery('class_entry', 'get_waitlist_by_class', duration, dbError.message);
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
      .from('trial')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trial', 'get_trials_for_waitlist');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get classes with counts
    const { data: classes, error: classError } = await supabase
      .from('class')
      .select(`
        id,
        name,
        class_number,
        entry_limit,
        trial_id,
        trial:trial_id (
          id,
          name,
          trial_date
        )
      `)
      .in('trial_id', trialIds)
      .is('deleted_at', null)
      .order('class_number', { ascending: true });

    if (classError) {
      throw createDatabaseError(classError, 'class', 'get_classes_for_waitlist');
    }

    // Get counts for each class
    const classesWithCounts = await Promise.all(
      (classes || []).map(async (cls) => {
        // Get accepted count
        const { count: acceptedCount } = await supabase
          .from('class_entry')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .eq('status', 'accepted')
          .is('deleted_at', null);

        // Get waitlist count
        const { count: waitlistCount } = await supabase
          .from('class_entry')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .eq('status', 'waitlisted')
          .is('deleted_at', null);

        return {
          ...cls,
          accepted_count: acceptedCount || 0,
          waitlist_count: waitlistCount || 0,
        };
      })
    );

    const duration = Date.now() - startTime;
    logQuery('class', 'get_classes_with_waitlist_counts', duration);

    return { data: classesWithCounts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class', 'get_classes_with_waitlist_counts');
    logQuery('class', 'get_classes_with_waitlist_counts', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Offer a waitlist spot (change status from waitlisted to accepted)
 */
export const offerWaitlistSpot = async (classEntryId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .eq('status', 'waitlisted')
      .select(`
        id,
        entry_id,
        class_id,
        status,
        entry:entry_id (
          id,
          dog_id,
          handler,
          created_by,
          dog:dog_id (
            id,
            name,
            call_name
          )
        ),
        class:class_id (
          id,
          name,
          class_number
        )
      `)
      .single();

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'offer_waitlist_spot', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'offer_waitlist_spot');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'offer_waitlist_spot');
    logQuery('class_entry', 'offer_waitlist_spot', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Remove from waitlist (change status to rejected)
 */
export const removeFromWaitlist = async (classEntryId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .eq('status', 'waitlisted')
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'remove_from_waitlist', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'remove_from_waitlist');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'remove_from_waitlist');
    logQuery('class_entry', 'remove_from_waitlist', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get waitlist position for a specific entry
 */
export const getWaitlistPosition = async (classEntryId: string, classId: string) => {
  const startTime = Date.now();

  try {
    // Get the entry's created_at
    const { data: entry, error: entryError } = await supabase
      .from('class_entry')
      .select('created_at')
      .eq('id', classEntryId)
      .single();

    if (entryError || !entry) {
      return { position: null, error: entryError };
    }

    // Count entries ahead of this one
    const { count, error: countError } = await supabase
      .from('class_entry')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', classId)
      .eq('status', 'waitlisted')
      .is('deleted_at', null)
      .lt('created_at', entry.created_at);

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_waitlist_position', duration, countError?.message);

    if (countError) {
      return { position: null, error: countError };
    }

    return { position: (count || 0) + 1, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_waitlist_position', duration, (error as Error).message);
    return { position: null, error };
  }
};
