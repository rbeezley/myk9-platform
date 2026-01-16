/**
 * Secretary Entry Management Queries
 *
 * Database queries for trial secretaries to manage show entries.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

export interface SecretaryEntry {
  id: string;
  dog_id: string;
  show_id: string;
  handler: string | null;
  payment_status: string | null;
  entry_status: string | null;
  total_fees: number | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  armband_number: string | null;
  special_requests: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
  } | null;
  owner: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  class_entries: Array<{
    id: string;
    class_id: string;
    status: string | null;
    entry_fee: number | null;
    jump_height: string | null;
    armband: string | null;
    run_order: number | null;
    check_in_status: string | null;
    check_in_time: string | null;
    class: {
      id: string;
      name: string;
      class_number: string | null;
    } | null;
  }>;
}

/**
 * Get all entries for a show (for secretary management)
 */
export const getEntriesForShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entry')
      .select(`
        id,
        dog_id,
        show_id,
        handler,
        payment_status,
        entry_status,
        total_fees,
        submitted_at,
        created_at,
        updated_at,
        armband_number,
        special_requests,
        dog:dog_id (
          id,
          name,
          call_name,
          breed
        ),
        owner:created_by (
          id,
          first_name,
          last_name,
          email
        ),
        class_entry (
          id,
          class_id,
          status,
          entry_fee,
          jump_height,
          armband,
          run_order,
          check_in_status,
          check_in_time,
          class:class_id (
            id,
            name,
            class_number
          )
        )
      `)
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    const duration = Date.now() - startTime;
    logQuery('entry', 'get_entries_for_show', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry', 'get_entries_for_show');
    }

    // Transform class_entry to class_entries for consistent naming
    const transformedData = (data || []).map((entry) => ({
      ...entry,
      class_entries: entry.class_entry || [],
    }));

    return { data: transformedData, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'get_entries_for_show');
    logQuery('entry', 'get_entries_for_show', duration, dbError.message);
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
      .from('entry')
      .select('entry_status, payment_status')
      .eq('show_id', showId)
      .is('deleted_at', null);

    const duration = Date.now() - startTime;
    logQuery('entry', 'get_entry_counts', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry', 'get_entry_counts');
    }

    const counts = {
      total: entries?.length || 0,
      pending: entries?.filter((e) => e.entry_status === 'pending').length || 0,
      accepted: entries?.filter((e) => e.entry_status === 'accepted').length || 0,
      waitlist: entries?.filter((e) => e.entry_status === 'waitlisted').length || 0,
      paymentDue: entries?.filter((e) => e.payment_status === 'pending').length || 0,
    };

    return { data: counts, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'get_entry_counts');
    logQuery('entry', 'get_entry_counts', duration, dbError.message);
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
      .from('entry')
      .update({
        entry_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entry', 'update_entry_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry', 'update_entry_status');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'update_entry_status');
    logQuery('entry', 'update_entry_status', duration, dbError.message);
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
      .from('entry')
      .update({
        entry_status: status,
        updated_at: new Date().toISOString(),
      })
      .in('id', entryIds)
      .select();

    const duration = Date.now() - startTime;
    logQuery('entry', 'bulk_update_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry', 'bulk_update_status');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'bulk_update_status');
    logQuery('entry', 'bulk_update_status', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Update class entry check-in status
 */
export const updateCheckInStatus = async (
  classEntryId: string,
  status: string,
  notes?: string
) => {
  const startTime = Date.now();

  try {
    const updateData: Record<string, unknown> = {
      check_in_status: status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'checked_in') {
      updateData.check_in_time = new Date().toISOString();
    }

    if (notes !== undefined) {
      updateData.check_in_notes = notes;
    }

    const { data, error } = await supabase
      .from('class_entry')
      .update(updateData)
      .eq('id', classEntryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'update_check_in', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'update_check_in');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'update_check_in');
    logQuery('class_entry', 'update_check_in', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Bulk check-in entries for a class
 */
export const bulkCheckIn = async (classEntryIds: string[]) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('class_entry')
      .update({
        check_in_status: 'checked_in',
        check_in_time: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in('id', classEntryIds)
      .select();

    const duration = Date.now() - startTime;
    logQuery('class_entry', 'bulk_check_in', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'class_entry', 'bulk_check_in');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'class_entry', 'bulk_check_in');
    logQuery('class_entry', 'bulk_check_in', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Assign armband number to an entry
 */
export const assignArmband = async (entryId: string, armbandNumber: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entry')
      .update({
        armband_number: armbandNumber,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entry', 'assign_armband', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry', 'assign_armband');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'assign_armband');
    logQuery('entry', 'assign_armband', duration, dbError.message);
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
      .from('entry')
      .select('id, armband_number')
      .eq('show_id', showId)
      .eq('entry_status', 'accepted')
      .is('deleted_at', null)
      .is('armband_number', null)
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw createDatabaseError(fetchError, 'entry', 'auto_assign_armbands_fetch');
    }

    if (!entries || entries.length === 0) {
      return { data: { assigned: 0 }, error: null };
    }

    // Get the highest existing armband number
    const { data: maxArmband } = await supabase
      .from('entry')
      .select('armband_number')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband_number', 'is', null)
      .order('armband_number', { ascending: false })
      .limit(1)
      .single();

    let nextNumber = startNumber;
    if (maxArmband?.armband_number) {
      const parsed = parseInt(maxArmband.armband_number, 10);
      if (!isNaN(parsed)) {
        nextNumber = Math.max(nextNumber, parsed + 1);
      }
    }

    // Assign armbands
    const updates = entries.map((entry, index) => ({
      id: entry.id,
      armband_number: String(nextNumber + index),
      updated_at: new Date().toISOString(),
    }));

    // Update each entry (Supabase doesn't support bulk upsert with different values easily)
    let assignedCount = 0;
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('entry')
        .update({
          armband_number: update.armband_number,
          updated_at: update.updated_at,
        })
        .eq('id', update.id);

      if (!updateError) {
        assignedCount++;
      }
    }

    const duration = Date.now() - startTime;
    logQuery('entry', 'auto_assign_armbands', duration);

    return { data: { assigned: assignedCount, startedAt: nextNumber }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'auto_assign_armbands');
    logQuery('entry', 'auto_assign_armbands', duration, dbError.message);
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
      .from('entry')
      .select('id, armband_number, dog:dog_id(name)')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband_number', 'is', null);

    const duration = Date.now() - startTime;
    logQuery('entry', 'check_armband_conflicts', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry', 'check_armband_conflicts');
    }

    // Find duplicates
    const armbandMap = new Map<string, Array<{ id: string; dogName: string }>>();
    for (const entry of entries || []) {
      const armband = entry.armband_number;
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
    const dbError = createDatabaseError(error, 'entry', 'check_armband_conflicts');
    logQuery('entry', 'check_armband_conflicts', duration, dbError.message);
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
      .from('entry')
      .select(`
        id,
        armband_number,
        handler,
        payment_status,
        entry_status,
        total_fees,
        submitted_at,
        special_requests,
        dog:dog_id (
          id,
          name,
          call_name,
          breed,
          registration_number
        ),
        owner:created_by (
          first_name,
          last_name,
          email,
          phone
        ),
        class_entry (
          id,
          status,
          entry_fee,
          jump_height,
          run_order,
          check_in_status,
          class:class_id (
            name,
            class_number
          )
        )
      `)
      .eq('show_id', showId)
      .is('deleted_at', null)
      .order('armband_number', { ascending: true, nullsFirst: false });

    const duration = Date.now() - startTime;
    logQuery('entry', 'get_entries_for_export', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entry', 'get_entries_for_export');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entry', 'get_entries_for_export');
    logQuery('entry', 'get_entries_for_export', duration, dbError.message);
    return { data: [], error: dbError };
  }
};
