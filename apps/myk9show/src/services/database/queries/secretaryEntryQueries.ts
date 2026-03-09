/**
 * Secretary Entry Management Queries
 *
 * Database queries for trial secretaries to manage show entries.
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

export interface SecretaryEntry {
  id: string;
  dog_id: string | null;
  class_id: string | null;
  trial_id: string | null;
  show_id: string | null;
  handler: string | null;
  handler_id: string | null;
  payment_status: string | null;
  entry_status: string | null;
  entry_fee: number | null;
  submitted_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  armband: string | null;
  special_requests: string | null;
  jump_height: string | null;
  run_order: number | null;
  is_in_ring: boolean | null;
  registration_id: string | null;
  registration: {
    id: string;
    confirmation_number: string;
  } | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    max_entries: number | null;
  } | null;
}

/**
 * Get all entries for a show (for secretary management)
 */
export const getEntriesForShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        id,
        dog_id,
        class_id,
        trial_id,
        show_id,
        handler,
        handler_id,
        payment_status,
        entry_status,
        entry_fee,
        submitted_at,
        created_at,
        updated_at,
        armband,
        special_requests,
        jump_height,
        run_order,
        is_in_ring,
        registration_id,
        registration:registration_id (
          id,
          confirmation_number
        ),
        dog:dog_id (
          id,
          name,
          call_name,
          breed
        ),
        class:class_id (
          id,
          name,
          class_number,
          max_entries
        )
      `
      )
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_entries_for_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_entries_for_show');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_entries_for_show');
    logQuery('entries', 'get_entries_for_show', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Get entry counts by status for a show
 */
export const getEntryCountsByStatus = async (showId: string) => {
  const startTime = Date.now();

  try {
    // Get all entries for the show
    const { data: entries, error } = await supabase
      .from('entries')
      .select('entry_status, payment_status')
      .eq('show_id', showId)
      .is('deleted_at', null);

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_entry_counts', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_entry_counts');
    }

    const counts = {
      total: entries?.length || 0,
      pending: entries?.filter(e => e.entry_status === 'pending').length || 0,
      accepted: entries?.filter(e => e.entry_status === 'accepted').length || 0,
      waitlist: entries?.filter(e => e.entry_status === 'waitlisted').length || 0,
      paymentDue: entries?.filter(e => e.payment_status === 'pending').length || 0,
    };

    return { data: counts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_entry_counts');
    logQuery('entries', 'get_entry_counts', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Update entry status (accept, reject, waitlist)
 */
export const updateEntryStatus = async (entryId: string, status: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_entry_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_entry_status');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_entry_status');
    logQuery('entries', 'update_entry_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Bulk update entry status
 */
export const bulkUpdateEntryStatus = async (entryIds: string[], status: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: status,
        updated_at: new Date().toISOString(),
      })
      .in('id', entryIds)
      .select();

    const duration = Date.now() - startTime;
    logQuery('entries', 'bulk_update_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'bulk_update_status');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'bulk_update_status');
    logQuery('entries', 'bulk_update_status', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Update entry check-in status (mark as in ring)
 */
export const updateCheckInStatus = async (entryId: string, status: string, notes?: string) => {
  const startTime = Date.now();

  try {
    const isInRing = status === 'checked-in' || status === 'at-gate';
    const updateData: Record<string, unknown> = {
      is_in_ring: isInRing,
      updated_at: new Date().toISOString(),
    };

    if (isInRing) {
      updateData.ring_entry_time = new Date().toISOString();
    }

    if (notes !== undefined) {
      updateData.judge_notes = notes;
    }

    const { data, error } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_check_in', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_check_in');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_check_in');
    logQuery('entries', 'update_check_in', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Bulk check-in entries
 */
export const bulkCheckIn = async (entryIds: string[]) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        is_in_ring: true,
        ring_entry_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', entryIds)
      .select();

    const duration = Date.now() - startTime;
    logQuery('entries', 'bulk_check_in', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'bulk_check_in');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'bulk_check_in');
    logQuery('entries', 'bulk_check_in', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Assign armband number to an entry
 */
export const assignArmband = async (entryId: string, armband: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        armband: armband,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'assign_armband', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'assign_armband');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'assign_armband');
    logQuery('entries', 'assign_armband', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Auto-assign sequential armbands to all accepted entries without armbands
 */
export const autoAssignArmbands = async (showId: string, startNumber: number = 1) => {
  const startTime = Date.now();

  try {
    // Get entries without armbands, ordered by created_at
    const { data: entries, error: fetchError } = await supabase
      .from('entries')
      .select('id, armband')
      .eq('show_id', showId)
      .eq('entry_status', 'accepted')
      .is('deleted_at', null)
      .is('armband', null)
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw createDatabaseError(fetchError, 'entries', 'auto_assign_armbands_fetch');
    }

    if (!entries || entries.length === 0) {
      return { data: { assigned: 0 }, error: null };
    }

    // Get the highest existing armband number
    const { data: maxArmband } = await supabase
      .from('entries')
      .select('armband')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband', 'is', null)
      .order('armband', { ascending: false })
      .limit(1)
      .single();

    let nextNumber = startNumber;
    if (maxArmband?.armband) {
      const parsed = parseInt(maxArmband.armband, 10);
      if (!isNaN(parsed)) {
        nextNumber = Math.max(nextNumber, parsed + 1);
      }
    }

    // Assign armbands
    let assignedCount = 0;
    for (let i = 0; i < entries.length; i++) {
      const { error: updateError } = await supabase
        .from('entries')
        .update({
          armband: String(nextNumber + i),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entries[i].id);

      if (!updateError) {
        assignedCount++;
      }
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'auto_assign_armbands', duration);

    return { data: { assigned: assignedCount, startedAt: nextNumber }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'auto_assign_armbands');
    logQuery('entries', 'auto_assign_armbands', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Check for armband conflicts in a show
 */
export const checkArmbandConflicts = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data: entries, error } = await supabase
      .from('entries')
      .select('id, armband, dog:dog_id(name)')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband', 'is', null);

    const duration = Date.now() - startTime;
    logQuery('entries', 'check_armband_conflicts', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'check_armband_conflicts');
    }

    // Find duplicates
    const armbandMap = new Map<string, Array<{ id: string; dogName: string }>>();
    for (const entry of entries || []) {
      const armband = entry.armband;
      if (armband) {
        const existing = armbandMap.get(armband) || [];
        existing.push({
          id: entry.id,
          dogName: (entry.dog as { name: string } | null)?.name || 'Unknown',
        });
        armbandMap.set(armband, existing);
      }
    }

    const conflicts: Array<{
      armband: string;
      entries: Array<{ id: string; dogName: string }>;
    }> = [];

    armbandMap.forEach((entryList, armband) => {
      if (entryList.length > 1) {
        conflicts.push({ armband, entries: entryList });
      }
    });

    return { data: { conflicts, hasConflicts: conflicts.length > 0 }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'check_armband_conflicts');
    logQuery('entries', 'check_armband_conflicts', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Get entries for CSV export
 */
export const getEntriesForExport = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .select(
        `
        id,
        armband,
        handler,
        payment_status,
        entry_status,
        entry_fee,
        submitted_at,
        special_requests,
        jump_height,
        run_order,
        dog:dog_id (
          id,
          name,
          call_name,
          breed
        ),
        class:class_id (
          name,
          class_number
        )
      `
      )
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('armband', { ascending: true, nullsFirst: false });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_entries_for_export', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_entries_for_export');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'get_entries_for_export');
    logQuery('entries', 'get_entries_for_export', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Update run order for entries in a class
 */
export const updateRunOrder = async (entryId: string, runOrder: number) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        run_order: runOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_run_order', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_run_order');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_run_order');
    logQuery('entries', 'update_run_order', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
