/**
 * Day-of Operations Queries
 *
 * Database queries for day-of-show operations:
 * - Day-of entries (walk-in registrations)
 * - Move-up requests
 * - Scratch handling
 *
 * Note: Each row in the entries table represents one dog's entry into one class.
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
  fromClassId: string;
  toClassId: string;
  status: 'pending' | 'approved' | 'denied';
  reason?: string;
  created_at: string;
  handler: string | null;
  armband: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
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
    max_entries: number | null;
  } | null;
}

export interface ClassWithCapacity {
  id: string;
  name: string;
  class_number: string | null;
  max_entries: number | null;
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
        trial_id: classInfo?.trial_id,
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
 * Mark an entry as scratched
 */
export const scratchEntry = async (entryId: string, reason?: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratched',
        special_requests: reason || 'Scratched day-of',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(`
        id,
        entry_status,
        handler,
        armband,
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
    logQuery('entries', 'scratch_entry', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'scratch_entry');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'scratch_entry');
    logQuery('entries', 'scratch_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get entries eligible for scratching (accepted but not yet run)
 */
export const getScratchableEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get entries that can be scratched
    const { data, error } = await supabase
      .from('entries')
      .select(`
        id,
        class_id,
        trial_id,
        entry_status,
        jump_height,
        run_order,
        handler,
        armband,
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
      .eq('show_id', showId)
      .in('entry_status', ['accepted', 'checked_in'])
      .is('deleted_at', null)
      .order('run_order', { ascending: true, nullsFirst: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_scratchable_entries', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_scratchable_entries');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_scratchable_entries');
    logQuery('entries', 'get_scratchable_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Process a move-up request (move entry from one class to a higher class)
 */
export const processMoveUp = async (
  entryId: string,
  toClassId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    // Get the current entry details
    const { data: currentEntry, error: fetchError } = await supabase
      .from('entries')
      .select(`
        id,
        dog_id,
        show_id,
        class_id,
        trial_id,
        jump_height,
        entry_fee,
        handler,
        armband
      `)
      .eq('id', entryId)
      .single();

    if (fetchError || !currentEntry) {
      throw createDatabaseError(fetchError || new Error('Entry not found'), 'entries', 'process_move_up_fetch');
    }

    // Check capacity in target class
    const { count: acceptedCount } = await supabase
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('class_id', toClassId)
      .in('entry_status', ['accepted', 'checked_in'])
      .is('deleted_at', null);

    const { data: targetClass } = await supabase
      .from('classes')
      .select('id, name, max_entries, trial_id')
      .eq('id', toClassId)
      .single();

    if (!targetClass) {
      throw new Error('Target class not found');
    }

    const limit = targetClass.max_entries || 999;
    if ((acceptedCount || 0) >= limit) {
      return { data: null, error: { message: 'Target class is full' } };
    }

    // Mark original entry as 'moved'
    const { error: updateError } = await supabase
      .from('entries')
      .update({
        entry_status: 'moved',
        special_requests: `Moved up to ${targetClass.name}${reason ? ': ' + reason : ''}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId);

    if (updateError) {
      throw createDatabaseError(updateError, 'entries', 'process_move_up_update');
    }

    // Create new entry in target class
    const { data: newEntry, error: createError } = await supabase
      .from('entries')
      .insert({
        dog_id: currentEntry.dog_id,
        show_id: currentEntry.show_id,
        class_id: toClassId,
        trial_id: targetClass.trial_id,
        entry_status: 'accepted',
        payment_status: 'waived', // Move-ups typically don't require additional fees
        entry_fee: 0,
        jump_height: currentEntry.jump_height,
        handler: currentEntry.handler,
        armband: currentEntry.armband,
        special_requests: `Moved up from class ${currentEntry.class_id}${reason ? ': ' + reason : ''}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select(`
        id,
        entry_status,
        handler,
        armband,
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

    if (createError) {
      // Rollback the status change if new entry fails
      await supabase
        .from('entries')
        .update({ entry_status: 'accepted', special_requests: null, updated_at: new Date().toISOString() })
        .eq('id', entryId);
      throw createDatabaseError(createError, 'entries', 'process_move_up_create');
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'process_move_up', duration);

    return { data: newEntry, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'process_move_up');
    logQuery('entries', 'process_move_up', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get entries eligible for move-up (qualified in a lower class)
 */
export const getMoveUpEligibleEntries = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get entries that are accepted/checked-in and could move up
    const { data, error } = await supabase
      .from('entries')
      .select(`
        id,
        class_id,
        trial_id,
        entry_status,
        jump_height,
        handler,
        armband,
        dog:dog_id (
          id,
          name,
          call_name
        ),
        class:class_id (
          id,
          name,
          class_number,
          trial_id
        )
      `)
      .eq('show_id', showId)
      .in('entry_status', ['accepted', 'checked_in'])
      .is('deleted_at', null)
      .order('class_id');

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_move_up_eligible', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_move_up_eligible');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_move_up_eligible');
    logQuery('entries', 'get_move_up_eligible', duration, dbError.message);
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
 * Get pending move-up requests for a show
 */
export const getPendingMoveUpRequests = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get entries with move-up requests (entry_status = 'move_up_requested')
    const { data, error } = await supabase
      .from('entries')
      .select(`
        id,
        class_id,
        trial_id,
        entry_status,
        jump_height,
        special_requests,
        created_at,
        updated_at,
        handler,
        armband,
        dog:dog_id (
          id,
          name,
          call_name
        ),
        class:class_id (
          id,
          name,
          class_number,
          trial_id
        )
      `)
      .eq('show_id', showId)
      .eq('entry_status', 'move_up_requested')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_pending_move_up_requests', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_pending_move_up_requests');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_pending_move_up_requests');
    logQuery('entries', 'get_pending_move_up_requests', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Approve a move-up request
 */
export const approveMoveUpRequest = async (
  entryId: string,
  toClassId: string,
  reason?: string
) => {
  // Use the existing processMoveUp function
  return processMoveUp(entryId, toClassId, reason);
};

/**
 * Deny a move-up request
 */
export const denyMoveUpRequest = async (
  entryId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'accepted', // Revert to accepted status
        special_requests: reason ? `Move-up denied: ${reason}` : 'Move-up request denied',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'move_up_requested')
      .select(`
        id,
        entry_status,
        handler,
        armband,
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
    logQuery('entries', 'deny_move_up_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'deny_move_up_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'deny_move_up_request');
    logQuery('entries', 'deny_move_up_request', duration, dbError.message);
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

// ============================================================================
// Scratch Management with Refunds
// ============================================================================

export interface ScratchRequest {
  id: string;
  class_id: string;
  trial_id: string;
  entry_status: string;
  entry_fee: number;
  scratched_at: string | null;
  scratch_reason: string | null;
  refund_status: 'pending' | 'eligible' | 'processed' | 'denied' | 'not_applicable';
  refund_amount: number | null;
  handler: string | null;
  armband: string | null;
  payment_status: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
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
    // Get scratched entries
    const { data, error } = await supabase
      .from('entries')
      .select(`
        id,
        class_id,
        trial_id,
        entry_status,
        entry_fee,
        handler,
        armband,
        payment_status,
        special_requests,
        updated_at,
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
      .eq('show_id', showId)
      .eq('entry_status', 'scratched')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_scratched_entries', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_scratched_entries');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_scratched_entries');
    logQuery('entries', 'get_scratched_entries', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Request a scratch with reason
 */
export const requestScratch = async (
  entryId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratched',
        special_requests: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(`
        id,
        entry_status,
        entry_fee,
        handler,
        armband,
        payment_status,
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
    logQuery('entries', 'request_scratch', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'request_scratch');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'request_scratch');
    logQuery('entries', 'request_scratch', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get pending scratch requests (entries requesting to scratch)
 */
export const getPendingScratchRequests = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get entries with scratch_requested status
    const { data, error } = await supabase
      .from('entries')
      .select(`
        id,
        class_id,
        trial_id,
        entry_status,
        entry_fee,
        special_requests,
        created_at,
        handler,
        armband,
        payment_status,
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
      .eq('show_id', showId)
      .eq('entry_status', 'scratch_requested')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_pending_scratch_requests', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_pending_scratch_requests');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_pending_scratch_requests');
    logQuery('entries', 'get_pending_scratch_requests', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Approve a scratch request
 * Note: Refund processing should be handled separately via payment service
 */
export const approveScratchRequest = async (entryId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratched',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'scratch_requested')
      .select(`
        id,
        entry_status,
        entry_fee,
        handler,
        armband,
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
    logQuery('entries', 'approve_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'approve_scratch_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'approve_scratch_request');
    logQuery('entries', 'approve_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Deny a scratch request
 */
export const denyScratchRequest = async (
  entryId: string,
  reason?: string
) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'accepted', // Revert to accepted
        special_requests: reason ? `Scratch denied: ${reason}` : 'Scratch request denied',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'scratch_requested')
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'deny_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'deny_scratch_request');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'deny_scratch_request');
    logQuery('entries', 'deny_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
