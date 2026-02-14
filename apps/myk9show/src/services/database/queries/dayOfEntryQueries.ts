/**
 * Day-of Entry Queries
 *
 * Database queries for day-of-show entry operations:
 * - Class capacity checking
 * - Walk-in registration (day-of entries)
 * - Show dog lookup
 * - Dog search for new entries
 *
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { DayOfEntry } from './dayOfOperationsTypes';

/**
 * Get classes with available capacity for day-of entries
 */
export const getClassesWithCapacity = async (showId: string) => {
  const startTime = Date.now();

  try {
    // First get all trials for the show
    const { data: trials, error: trialsError } = await supabase
      .from('trials')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trials', 'get_trials_for_capacity');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get classes with their entry counts
    // Note: class_number column exists but Supabase types need regeneration
    const { data: classes, error: classError } = await supabase
      .from('classes')
      .select(`
        id,
        name,
        class_number,
        max_entries,
        trial_id
      `)
      .in('trial_id', trialIds)
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (classError) {
      throw createDatabaseError(classError, 'classes', 'get_classes_for_capacity');
    }

    // Get counts for each class
    const classesWithCapacity = await Promise.all(
      (classes || []).map(async (cls) => {
        const { count: acceptedCount } = await supabase
          .from('entries')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .in('entry_status', ['accepted', 'checked_in'])
          .is('deleted_at', null);

        const limit = cls.max_entries || 999;
        const accepted = acceptedCount || 0;

        return {
          ...cls,
          accepted_count: accepted,
          available_spots: Math.max(0, limit - accepted),
        };
      })
    );

    const duration = Date.now() - startTime;
    logQuery('classes', 'get_classes_with_capacity', duration);

    return { data: classesWithCapacity, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'classes', 'get_classes_with_capacity');
    logQuery('classes', 'get_classes_with_capacity', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Create a day-of entry (walk-in registration)
 * Creates one entry row per class (since each entry = one dog in one class)
 */
export const createDayOfEntry = async (entryData: DayOfEntry, userId: string) => {
  const startTime = Date.now();

  try {
    // Get the next available armband number
    const { data: maxArmband } = await supabase
      .from('entries')
      .select('armband')
      .eq('show_id', entryData.showId)
      .is('deleted_at', null)
      .not('armband', 'is', null)
      .order('armband', { ascending: false })
      .limit(1)
      .single();

    let nextArmband = 1;
    if (maxArmband?.armband) {
      const parsed = parseInt(maxArmband.armband, 10);
      if (!isNaN(parsed)) {
        nextArmband = parsed + 1;
      }
    }

    // Get trial_id and entry_fee for each class
    const { data: classData } = await supabase
      .from('classes')
      .select('id, trial_id, entry_fee')
      .in('id', entryData.classIds);

    const classInfoMap = new Map(
      classData?.map((c) => [c.id, { trial_id: c.trial_id, entry_fee: c.entry_fee }]) || []
    );

    // Calculate total fees
    const defaultFee = 35;
    const totalFees = entryData.classIds.reduce((sum, classId) => {
      const info = classInfoMap.get(classId);
      return sum + (info?.entry_fee || defaultFee);
    }, 0);

    // Create one entry per class (entries table has one row per class entry)
    const entries = entryData.classIds.map((classId, index) => {
      const classInfo = classInfoMap.get(classId);
      return {
        dog_id: entryData.dogId,
        show_id: entryData.showId,
        class_id: classId,
        ...(classInfo?.trial_id !== undefined && { trial_id: classInfo.trial_id }),
        handler: entryData.handler,
        handler_id: userId, // Track who created the day-of entry
        payment_status: entryData.paymentMethod === 'waived' ? 'waived' : 'paid',
        entry_status: 'accepted',
        entry_fee: entryData.paymentMethod === 'waived' ? 0 : (classInfo?.entry_fee || defaultFee),
        armband: String(nextArmband), // Same armband for all classes (same dog/handler)
        jump_height: entryData.jumpHeight || null,
        special_requests: index === 0 ? (entryData.notes || null) : null, // Only on first entry
        submitted_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });

    const { data: createdEntries, error: entryError } = await supabase
      .from('entries')
      .insert(entries)
      .select();

    if (entryError) {
      throw createDatabaseError(entryError, 'entries', 'create_day_of_entry');
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'create_day_of_entry', duration);

    return {
      data: {
        entries: createdEntries,
        armbandNumber: nextArmband,
        classCount: entryData.classIds.length,
        totalFees: entryData.paymentMethod === 'waived' ? 0 : totalFees,
      },
      error: null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'create_day_of_entry');
    logQuery('entries', 'create_day_of_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get dogs registered for the show (for day-of entry dog selector)
 */
export const getShowDogs = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get dogs that already have entries in this show
    const { data: existingEntries, error: entriesError } = await supabase
      .from('entries')
      .select(`
        dog_id,
        dog:dog_id (
          id,
          name,
          call_name,
          breed
        )
      `)
      .eq('show_id', showId)
      .is('deleted_at', null);

    if (entriesError) {
      throw createDatabaseError(entriesError, 'entries', 'get_show_dogs');
    }

    // Get unique dogs
    const dogMap = new Map();
    existingEntries?.forEach((entry) => {
      if (entry.dog && !dogMap.has(entry.dog_id)) {
        dogMap.set(entry.dog_id, entry.dog);
      }
    });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_show_dogs', duration);

    return { data: Array.from(dogMap.values()), error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_show_dogs');
    logQuery('entries', 'get_show_dogs', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Search all dogs (for adding new entries)
 */
export const searchDogs = async (searchTerm: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('dogs')
      .select(`
        id,
        name,
        call_name,
        breed,
        owner:owner_id (
          id,
          first_name,
          last_name
        )
      `)
      .or(`name.ilike.%${searchTerm}%,call_name.ilike.%${searchTerm}%`)
      .is('deleted_at', null)
      .limit(20);

    const duration = Date.now() - startTime;
    logQuery('dogs', 'search_dogs', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dogs', 'search_dogs');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dogs', 'search_dogs');
    logQuery('dogs', 'search_dogs', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
