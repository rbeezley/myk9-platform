/**
 * Day-of Operations Queries
 *
 * Database queries for day-of-show operations:
 * - Day-of entries (walk-in registrations)
 * - Move-up requests
 * - Scratch handling
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

export interface DayOfEntry {
  dogId: string;
  showId: string;
  classIds: string[];
  handler: string;
  paymentMethod: 'cash' | 'check' | 'waived';
  jumpHeight?: string;
  notes?: string;
}

export interface MoveUpRequest {
  id: string;
  classEntryId: string;
  fromClassId: string;
  toClassId: string;
  status: 'pending' | 'approved' | 'denied';
  reason?: string;
  created_at: string;
  entry: {
    id: string;
    handler: string | null;
    armband_number: string | null;
    dog: {
      id: string;
      name: string;
      call_name: string | null;
    } | null;
  } | null;
  fromClass: {
    id: string;
    name: string;
    class_number: string | null;
  } | null;
  toClass: {
    id: string;
    name: string;
    class_number: string | null;
    entry_limit: number | null;
  } | null;
}

export interface ClassWithCapacity {
  id: string;
  name: string;
  class_number: string | null;
  entry_limit: number | null;
  trial_id: string;
  accepted_count: number;
  available_spots: number;
}

/**
 * Get classes with available capacity for day-of entries
 */
export const getClassesWithCapacity = async (showId: string) => {
  const startTime = Date.now();

  try {
    // First get all trials for the show
    const { data: trials, error: trialsError } = await supabase
      .from('trial')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trial', 'get_trials_for_capacity');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get classes with their entry counts
    const { data: classes, error: classError } = await supabase
      .from('class')
      .select(`
        id,
        name,
        class_number,
        entry_limit,
        trial_id
      `)
      .in('trial_id', trialIds)
      .is('deleted_at', null)
      .order('class_number', { ascending: true });

    if (classError) {
      throw createDatabaseError(classError, 'class', 'get_classes_for_capacity');
    }

    // Get counts for each class
    const classesWithCapacity = await Promise.all(
      (classes || []).map(async (cls) => {
        const { count: acceptedCount } = await supabase
          .from('class_entry')
          .select('id', { count: 'exact', head: true })
          .eq('class_id', cls.id)
          .in('status', ['accepted', 'checked_in'])
          .is('deleted_at', null);

        const limit = cls.entry_limit || 999;
        const accepted = acceptedCount || 0;

        return {
          ...cls,
          accepted_count: accepted,
          available_spots: Math.max(0, limit - accepted),
        };
      })
    );

    const duration = Date.now() - startTime;
    logQuery('class', 'get_classes_with_capacity', duration);

    return { data: classesWithCapacity, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class', 'get_classes_with_capacity');
    logQuery('class', 'get_classes_with_capacity', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Create a day-of entry (walk-in registration)
 */
export const createDayOfEntry = async (entryData: DayOfEntry, userId: string) => {
  const startTime = Date.now();

  try {
    // Get the next available armband number
    const { data: maxArmband } = await supabase
      .from('entry')
      .select('armband_number')
      .eq('show_id', entryData.showId)
      .is('deleted_at', null)
      .not('armband_number', 'is', null)
      .order('armband_number', { ascending: false })
      .limit(1)
      .single();

    let nextArmband = 1;
    if (maxArmband?.armband_number) {
      const parsed = parseInt(maxArmband.armband_number, 10);
      if (!isNaN(parsed)) {
        nextArmband = parsed + 1;
      }
    }

    // Calculate total fees (simplified - you may want to fetch actual class fees)
    const totalFees = entryData.classIds.length * 35; // Default fee per class

    // Create the entry
    const { data: entry, error: entryError } = await supabase
      .from('entry')
      .insert({
        dog_id: entryData.dogId,
        show_id: entryData.showId,
        handler: entryData.handler,
        payment_status: entryData.paymentMethod === 'waived' ? 'waived' : 'paid',
        entry_status: 'accepted',
        total_fees: entryData.paymentMethod === 'waived' ? 0 : totalFees,
        armband_number: String(nextArmband),
        special_requests: entryData.notes || null,
        submitted_at: new Date().toISOString(),
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (entryError) {
      throw createDatabaseError(entryError, 'entry', 'create_day_of_entry');
    }

    // Get trial_id for each class
    const { data: classData } = await supabase
      .from('class')
      .select('id, trial_id')
      .in('id', entryData.classIds);

    const classTrialMap = new Map(classData?.map((c) => [c.id, c.trial_id]) || []);

    // Create class entries for each selected class
    const classEntries = entryData.classIds.map((classId) => ({
      entry_id: entry.id,
      class_id: classId,
      trial_id: classTrialMap.get(classId),
      status: 'accepted',
      entry_fee: 35, // Default fee
      jump_height: entryData.jumpHeight || null,
      check_in_status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: classEntryError } = await supabase
      .from('class_entry')
      .insert(classEntries);

    if (classEntryError) {
      // Rollback entry if class entries fail
      await supabase.from('entry').delete().eq('id', entry.id);
      throw createDatabaseError(classEntryError, 'class_entry', 'create_day_of_class_entries');
    }

    const duration = Date.now() - startTime;
    logQuery('entry', 'create_day_of_entry', duration);

    return {
      data: {
        entry,
        armbandNumber: nextArmband,
        classCount: entryData.classIds.length,
      },
      error: null,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'create_day_of_entry');
    logQuery('entry', 'create_day_of_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Mark a class entry as scratched
 */
export const scratchEntry = async (classEntryId: string, reason?: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        status: 'scratched',
        check_in_notes: reason || 'Scratched day-of',
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .select(`
        id,
        status,
        entry:entry_id (
          id,
          handler,
          armband_number,
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
    logQuery('class_entry', 'scratch_entry', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'scratch_entry');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'scratch_entry');
    logQuery('class_entry', 'scratch_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get entries eligible for scratching (checked in but not yet run)
 */
export const getScratchableEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get all trials for the show
    const { data: trials, error: trialsError } = await supabase
      .from('trial')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trial', 'get_trials_for_scratch');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get entries that can be scratched
    const { data, error } = await supabase
      .from('class_entry')
      .select(`
        id,
        class_id,
        status,
        check_in_status,
        jump_height,
        run_order,
        entry:entry_id (
          id,
          handler,
          armband_number,
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
      .in('trial_id', trialIds)
      .in('status', ['accepted', 'checked_in'])
      .is('deleted_at', null)
      .order('run_order', { ascending: true, nullsFirst: false });

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_scratchable_entries', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'get_scratchable_entries');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'get_scratchable_entries');
    logQuery('class_entry', 'get_scratchable_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Process a move-up request (move entry from one class to a higher class)
 */
export const processMoveUp = async (
  classEntryId: string,
  toClassId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    // Get the current class entry details
    const { data: currentEntry, error: fetchError } = await supabase
      .from('class_entry')
      .select(`
        id,
        entry_id,
        class_id,
        trial_id,
        jump_height,
        entry_fee,
        entry:entry_id (
          id,
          handler,
          armband_number
        )
      `)
      .eq('id', classEntryId)
      .single();

    if (fetchError || !currentEntry) {
      throw createDatabaseError(fetchError || new Error('Entry not found'), 'class_entry', 'process_move_up_fetch');
    }

    // Check capacity in target class
    const { count: acceptedCount } = await supabase
      .from('class_entry')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', toClassId)
      .in('status', ['accepted', 'checked_in'])
      .is('deleted_at', null);

    const { data: targetClass } = await supabase
      .from('class')
      .select('id, name, entry_limit, trial_id')
      .eq('id', toClassId)
      .single();

    if (!targetClass) {
      throw new Error('Target class not found');
    }

    const limit = targetClass.entry_limit || 999;
    if ((acceptedCount || 0) >= limit) {
      return { data: null, error: { message: 'Target class is full' } };
    }

    // Mark original entry as 'moved'
    const { error: updateError } = await supabase
      .from('class_entry')
      .update({
        status: 'moved',
        check_in_notes: `Moved up to ${targetClass.name}${reason ? ': ' + reason : ''}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId);

    if (updateError) {
      throw createDatabaseError(updateError, 'class_entry', 'process_move_up_update');
    }

    // Create new class entry in target class
    const { data: newEntry, error: createError } = await supabase
      .from('class_entry')
      .insert({
        entry_id: currentEntry.entry_id,
        class_id: toClassId,
        trial_id: targetClass.trial_id,
        status: 'accepted',
        entry_fee: 0, // Move-ups typically don't require additional fees
        jump_height: currentEntry.jump_height,
        check_in_status: 'pending',
        check_in_notes: `Moved up from class ${currentEntry.class_id}${reason ? ': ' + reason : ''}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`
        id,
        status,
        entry:entry_id (
          id,
          handler,
          armband_number,
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

    if (createError) {
      // Rollback the status change if new entry fails
      await supabase
        .from('class_entry')
        .update({ status: 'accepted', check_in_notes: null, updated_at: new Date().toISOString() })
        .eq('id', classEntryId);
      throw createDatabaseError(createError, 'class_entry', 'process_move_up_create');
    }

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'process_move_up', duration);

    return { data: newEntry, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'process_move_up');
    logQuery('class_entry', 'process_move_up', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get entries eligible for move-up (qualified in a lower class)
 */
export const getMoveUpEligibleEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get all trials for the show
    const { data: trials, error: trialsError } = await supabase
      .from('trial')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trial', 'get_trials_for_move_up');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get entries that are accepted/checked-in and could move up
    // In a real scenario, you'd check if they qualified in a previous class
    const { data, error } = await supabase
      .from('class_entry')
      .select(`
        id,
        class_id,
        status,
        check_in_status,
        jump_height,
        entry:entry_id (
          id,
          handler,
          armband_number,
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
          trial_id
        )
      `)
      .in('trial_id', trialIds)
      .in('status', ['accepted', 'checked_in'])
      .is('deleted_at', null)
      .order('class_id');

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_move_up_eligible', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'get_move_up_eligible');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'get_move_up_eligible');
    logQuery('class_entry', 'get_move_up_eligible', duration, dbError.message);
    return { data: [], error: dbError };
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
      .from('entry')
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
      throw createDatabaseError(entriesError, 'entry', 'get_show_dogs');
    }

    // Get unique dogs
    const dogMap = new Map();
    existingEntries?.forEach((entry) => {
      if (entry.dog && !dogMap.has(entry.dog_id)) {
        dogMap.set(entry.dog_id, entry.dog);
      }
    });

    const duration = Date.now() - startTime;
    logQuery('entry', 'get_show_dogs', duration);

    return { data: Array.from(dogMap.values()), error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'get_show_dogs');
    logQuery('entry', 'get_show_dogs', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get pending move-up requests for a show
 */
export const getPendingMoveUpRequests = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get all trials for the show
    const { data: trials, error: trialsError } = await supabase
      .from('trial')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trial', 'get_trials_for_move_up_requests');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get entries with move-up requests (status = 'move_up_requested')
    const { data, error } = await supabase
      .from('class_entry')
      .select(`
        id,
        class_id,
        trial_id,
        status,
        jump_height,
        check_in_notes,
        created_at,
        updated_at,
        move_up_target_class_id,
        entry:entry_id (
          id,
          handler,
          armband_number,
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
          trial_id
        )
      `)
      .in('trial_id', trialIds)
      .eq('status', 'move_up_requested')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_pending_move_up_requests', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'get_pending_move_up_requests');
    }

    // Enhance with target class info
    const enhancedData = await Promise.all(
      (data || []).map(async (entry) => {
        let targetClass = null;
        if (entry.move_up_target_class_id) {
          const { data: targetData } = await supabase
            .from('class')
            .select('id, name, class_number, entry_limit')
            .eq('id', entry.move_up_target_class_id)
            .single();
          targetClass = targetData;
        }
        return { ...entry, targetClass };
      })
    );

    return { data: enhancedData, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'get_pending_move_up_requests');
    logQuery('class_entry', 'get_pending_move_up_requests', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Approve a move-up request
 */
export const approveMoveUpRequest = async (
  classEntryId: string,
  toClassId: string,
  reason?: string
) => {
  // Use the existing processMoveUp function
  return processMoveUp(classEntryId, toClassId, reason);
};

/**
 * Deny a move-up request
 */
export const denyMoveUpRequest = async (
  classEntryId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        status: 'accepted', // Revert to accepted status
        move_up_target_class_id: null,
        check_in_notes: reason ? `Move-up denied: ${reason}` : 'Move-up request denied',
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .eq('status', 'move_up_requested')
      .select(`
        id,
        status,
        entry:entry_id (
          id,
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
    logQuery('class_entry', 'deny_move_up_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'deny_move_up_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'deny_move_up_request');
    logQuery('class_entry', 'deny_move_up_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Search all dogs (for adding new entries)
 */
export const searchDogs = async (searchTerm: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('dog')
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
    logQuery('dog', 'search_dogs', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dog', 'search_dogs');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'search_dogs');
    logQuery('dog', 'search_dogs', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// ============================================================================
// Scratch Management with Refunds
// ============================================================================

export interface ScratchRequest {
  id: string;
  class_id: string;
  trial_id: string;
  status: string;
  entry_fee: number;
  scratched_at: string | null;
  scratch_reason: string | null;
  refund_status: 'pending' | 'eligible' | 'processed' | 'denied' | 'not_applicable';
  refund_amount: number | null;
  entry: {
    id: string;
    handler: string | null;
    armband_number: string | null;
    payment_status: string | null;
    stripe_payment_intent_id: string | null;
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
  } | null;
}

/**
 * Get scratched entries for a show with refund eligibility
 */
export const getScratchedEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get all trials for the show
    const { data: trials, error: trialsError } = await supabase
      .from('trial')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trial', 'get_trials_for_scratches');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get scratched entries
    const { data, error } = await supabase
      .from('class_entry')
      .select(`
        id,
        class_id,
        trial_id,
        status,
        entry_fee,
        scratched_at,
        scratch_reason,
        refund_status,
        refund_amount,
        entry:entry_id (
          id,
          handler,
          armband_number,
          payment_status,
          stripe_payment_intent_id,
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
      .in('trial_id', trialIds)
      .eq('status', 'scratched')
      .is('deleted_at', null)
      .order('scratched_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_scratched_entries', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'get_scratched_entries');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'get_scratched_entries');
    logQuery('class_entry', 'get_scratched_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Request a scratch with reason
 */
export const requestScratch = async (
  classEntryId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        status: 'scratched',
        scratched_at: new Date().toISOString(),
        scratch_reason: reason || null,
        refund_status: 'pending', // Will be evaluated for eligibility
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .select(`
        id,
        status,
        entry_fee,
        scratched_at,
        scratch_reason,
        entry:entry_id (
          id,
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
          class_number
        )
      `)
      .single();

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'request_scratch', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'request_scratch');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'request_scratch');
    logQuery('class_entry', 'request_scratch', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Update refund status for a scratch
 */
export const updateRefundStatus = async (
  classEntryId: string,
  status: 'eligible' | 'processed' | 'denied' | 'not_applicable',
  refundAmount?: number
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        refund_status: status,
        refund_amount: refundAmount ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .eq('status', 'scratched')
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'update_refund_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'update_refund_status');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'update_refund_status');
    logQuery('class_entry', 'update_refund_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get pending scratch requests (entries requesting to scratch)
 */
export const getPendingScratchRequests = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get all trials for the show
    const { data: trials, error: trialsError } = await supabase
      .from('trial')
      .select('id')
      .eq('show_id', showId);

    if (trialsError) {
      throw createDatabaseError(trialsError, 'trial', 'get_trials_for_scratch_requests');
    }

    const trialIds = trials?.map((t) => t.id) || [];

    if (trialIds.length === 0) {
      return { data: [], error: null };
    }

    // Get entries with scratch_requested status
    const { data, error } = await supabase
      .from('class_entry')
      .select(`
        id,
        class_id,
        trial_id,
        status,
        entry_fee,
        scratch_reason,
        created_at,
        entry:entry_id (
          id,
          handler,
          armband_number,
          payment_status,
          stripe_payment_intent_id,
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
      .in('trial_id', trialIds)
      .eq('status', 'scratch_requested')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'get_pending_scratch_requests', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'get_pending_scratch_requests');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'get_pending_scratch_requests');
    logQuery('class_entry', 'get_pending_scratch_requests', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Approve a scratch request (optionally with refund)
 */
export const approveScratchRequest = async (
  classEntryId: string,
  processRefund: boolean,
  refundAmount?: number
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        status: 'scratched',
        scratched_at: new Date().toISOString(),
        refund_status: processRefund ? 'eligible' : 'not_applicable',
        refund_amount: processRefund ? refundAmount : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .eq('status', 'scratch_requested')
      .select(`
        id,
        status,
        entry_fee,
        scratched_at,
        refund_status,
        refund_amount,
        entry:entry_id (
          id,
          handler,
          stripe_payment_intent_id,
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
    logQuery('class_entry', 'approve_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'approve_scratch_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'approve_scratch_request');
    logQuery('class_entry', 'approve_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Deny a scratch request
 */
export const denyScratchRequest = async (
  classEntryId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        status: 'accepted', // Revert to accepted
        check_in_notes: reason ? `Scratch denied: ${reason}` : 'Scratch request denied',
        updated_at: new Date().toISOString(),
      })
      .eq('id', classEntryId)
      .eq('status', 'scratch_requested')
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'deny_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'deny_scratch_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'deny_scratch_request');
    logQuery('class_entry', 'deny_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
