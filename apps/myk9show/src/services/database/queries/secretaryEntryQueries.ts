/**
 * Secretary Entry Management Queries
 *
 * Database queries for trial secretaries to manage show entries.
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { CheckInStatus } from '@myk9/core';
import { computeArmbandAssignments, resolveStartNumber } from '@/utils/armbandUtils';

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
  check_in_status: string | null;
  registration_id: string | null;
  registration: {
    id: string;
    confirmation_number: string;
    payment_status: string | null;
    payment_reference: string | null;
    total_amount: number | null;
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
        check_in_status,
        registration_id,
        registration:registration_id (
          id,
          confirmation_number,
          payment_status,
          payment_reference,
          total_amount
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
      submitted: entries?.filter(e => e.entry_status === 'submitted').length || 0,
      confirmed: entries?.filter(e => e.entry_status === 'confirmed').length || 0,
      pendingPayment: entries?.filter(e => e.entry_status === 'pending-payment').length || 0,
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
export const updateEntryStatus = async (entryId: string, status: EntryStatus) => {
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
export const bulkUpdateEntryStatus = async (entryIds: string[], status: EntryStatus) => {
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
export const updateCheckInStatus = async (
  entryId: string,
  status: CheckInStatus,
  notes?: string
) => {
  const startTime = Date.now();

  try {
    const isInRing = status === 'checked-in' || status === 'at-gate';
    const updateData: Record<string, unknown> = {
      check_in_status: status,
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
 * Assign armband number to an entry (per-dog-per-show: upserts into armbands table
 * and propagates the armband value to ALL class entries for that dog in that show).
 */
export const assignArmband = async (entryId: string, armband: string) => {
  const startTime = Date.now();

  try {
    const { data: entry, error: lookupError } = await supabase
      .from('entries')
      .select('dog_id, show_id')
      .eq('id', entryId)
      .single();

    if (lookupError || !entry || !entry.dog_id || !entry.show_id) {
      throw createDatabaseError(
        lookupError ?? new Error('Entry not found'),
        'entries',
        'assign_armband'
      );
    }

    const { error: armbandError } = await supabase.from('armbands').upsert(
      {
        show_id: entry.show_id,
        dog_id: entry.dog_id,
        armband_number: armband,
        assigned_at: new Date().toISOString(),
        is_available: false,
      },
      { onConflict: 'show_id,dog_id' }
    );

    if (armbandError) {
      const isConflict =
        (armbandError as { code?: string }).code === '23505' ||
        armbandError.message?.includes('armbands_show_armband_number') ||
        armbandError.message?.includes('duplicate key');
      if (isConflict) {
        return {
          data: null,
          error: createDatabaseError(
            new Error(`Armband ${armband} is already assigned to another dog in this show.`),
            'armbands',
            'assign_armband'
          ),
        };
      }
      throw createDatabaseError(armbandError, 'armbands', 'assign_armband');
    }

    const { data, error: updateError } = await supabase
      .from('entries')
      .update({ armband, updated_at: new Date().toISOString() })
      .eq('dog_id', entry.dog_id)
      .eq('show_id', entry.show_id)
      .is('deleted_at', null)
      .select('id');

    const duration = Date.now() - startTime;
    logQuery('entries', 'assign_armband', duration, updateError?.message);

    if (updateError) throw createDatabaseError(updateError, 'entries', 'assign_armband');

    return { data: { updated: data?.length ?? 0, armband }, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'assign_armband');
    logQuery('entries', 'assign_armband', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Auto-assign sequential armbands to all unassigned accepted/confirmed dogs in a show.
 * Deduplicates by dog: each dog gets one armband number regardless of how many classes
 * they are entered in, and the number is propagated to all their class entries.
 */
export const autoAssignArmbands = async (showId: string, startNumber: number = 1) => {
  const startTime = Date.now();

  try {
    const { data: unassigned, error: fetchError } = await supabase
      .from('entries')
      .select('dog_id')
      .eq('show_id', showId)
      .in('entry_status', ['accepted', 'confirmed'])
      .is('deleted_at', null)
      .is('armband', null);

    if (fetchError) throw createDatabaseError(fetchError, 'entries', 'auto_assign_armbands_fetch');

    const dogIds = [...new Set((unassigned ?? []).map(e => e.dog_id).filter(Boolean) as string[])];

    if (dogIds.length === 0) {
      return { data: { assigned: 0, startedAt: startNumber }, error: null };
    }

    const { data: maxRow } = await supabase
      .from('entries')
      .select('armband')
      .eq('show_id', showId)
      .is('deleted_at', null)
      .not('armband', 'is', null)
      .order('armband', { ascending: false })
      .limit(1)
      .single();

    const nextNumber = resolveStartNumber(maxRow?.armband ?? null, startNumber);
    const assignments = computeArmbandAssignments(dogIds, nextNumber);

    let assignedCount = 0;
    for (const { dogId, armband } of assignments) {
      await supabase.from('armbands').upsert(
        {
          show_id: showId,
          dog_id: dogId,
          armband_number: armband,
          assigned_at: new Date().toISOString(),
          is_available: false,
        },
        { onConflict: 'show_id,dog_id' }
      );

      const { error: updateError } = await supabase
        .from('entries')
        .update({ armband, updated_at: new Date().toISOString() })
        .eq('dog_id', dogId)
        .eq('show_id', showId)
        .is('deleted_at', null);

      if (!updateError) assignedCount++;
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
 * Get entries for CSV export.
 * Uses a SECURITY DEFINER function that enforces is_trial_secretary(club_id)
 * before returning owner PII — prevents direct REST API data dumps.
 */
export const getEntriesForExport = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.rpc('get_entries_for_export', {
      p_show_id: showId,
    });

    const duration = Date.now() - startTime;
    logQuery('entries', 'get_entries_for_export', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'get_entries_for_export');
    }

    type RpcRow = {
      id: string;
      armband: string | null;
      handler: string | null;
      payment_status: string | null;
      entry_status: string | null;
      entry_fee: number | null;
      submitted_at: string | null;
      special_requests: string | null;
      jump_height: string | null;
      run_order: number | null;
      dog_id: string | null;
      dog_name: string | null;
      dog_call_name: string | null;
      dog_breed: string | null;
      owner_first_name: string | null;
      owner_last_name: string | null;
      owner_email: string | null;
      owner_phone: string | null;
      dog_registrations: unknown; // Json from generated types — cast when mapping
      class_name: string | null;
      class_number: string | null;
    };

    type DogReg = { organization: string; registration_number: string };

    const rows: RpcRow[] = (data ?? []) as RpcRow[];
    const mapped = rows.map(row => ({
      armband: row.armband,
      handler: row.handler,
      entry_status: row.entry_status,
      payment_status: row.payment_status,
      entry_fee: row.entry_fee,
      special_requests: row.special_requests,
      jump_height: row.jump_height,
      dog: row.dog_id
        ? {
            name: row.dog_name,
            call_name: row.dog_call_name,
            breed: row.dog_breed,
            owner: row.owner_first_name
              ? {
                  first_name: row.owner_first_name,
                  last_name: row.owner_last_name,
                  email: row.owner_email,
                  phone: row.owner_phone,
                }
              : null,
            dog_registrations: Array.isArray(row.dog_registrations)
              ? (row.dog_registrations as DogReg[])
              : [],
          }
        : null,
      class: row.class_name ? { name: row.class_name, class_number: row.class_number } : null,
    }));

    return { data: mapped, error: null };
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
