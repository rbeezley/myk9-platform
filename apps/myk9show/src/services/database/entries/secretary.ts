/**
 * Secretary Entry Management Queries
 *
 * Database queries for trial secretaries to manage show entries.
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { CheckInStatus } from '@myk9/core';

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
  withdrawal_reason: string | null;
  registration_id: string | null;
  registration: {
    id: string;
    confirmation_number: string;
    payment_status: string | null;
    payment_reference: string | null;
    total_amount: number | null;
    paid_amount: number | null;
    refund_amount: number | null;
    refund_notes: string | null;
    refunded_at: string | null;
  } | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
    owner: { id: string; email: string | null } | null;
  } | null;
  class: {
    id: string;
    name: string;
    class_number: string | null;
    max_entries: number | null;
  } | null;
}

export interface PendingEntry {
  id: string;
  showId: string;
  showName: string;
  className: string;
  handlerName: string;
  dogName: string;
  submittedAt: string;
}

function toPendingEntry(row: Record<string, unknown>): PendingEntry {
  const person = row.people as { first_name: string; last_name: string } | null;
  const dog = row.dogs as { call_name: string } | null;
  const cls = row.classes as { name: string } | null;
  const show = row.shows as { name: string } | null;

  return {
    id: row.id as string,
    showId: row.show_id as string,
    showName: show?.name ?? '',
    className: cls?.name ?? '',
    handlerName: person ? `${person.first_name} ${person.last_name}` : '',
    dogName: dog?.call_name ?? '',
    submittedAt: (row.submitted_at ?? row.created_at) as string,
  };
}

export const getPendingEntries = async (showIdFilter?: string): Promise<PendingEntry[]> => {
  let query = supabase
    .from('entries')
    .select('id, show_id, submitted_at, dogs(call_name), people(first_name, last_name), classes(name), shows(name)')
    .eq('entry_status', 'submitted');

  if (showIdFilter && showIdFilter !== 'all') {
    query = query.eq('show_id', showIdFilter);
  }

  const { data, error } = await query.order('submitted_at', {
    ascending: true,
    nullsFirst: false,
  });

  if (error) {
    throw createDatabaseError(error, 'entries', 'get_pending_entries');
  }

  return (data ?? []).map(toPendingEntry);
};

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
        withdrawal_reason,
        registration_id,
        registration:registration_id (
          id,
          confirmation_number,
          payment_status,
          payment_reference,
          total_amount,
          paid_amount,
          refund_amount,
          refund_notes,
          refunded_at
        ),
        dog:dog_id (
          id,
          name,
          call_name,
          breed,
          owner:owner_id (
            id,
            email
          )
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
 * Update entry status (accept, reject, waitlist, withdraw, scratch)
 */
export const updateEntryStatus = async (
  entryId: string,
  status: EntryStatus,
  withdrawalReason?: string
) => {
  const startTime = Date.now();

  try {
    const updateData: Record<string, unknown> = {
      entry_status: status,
      updated_at: new Date().toISOString(),
    };
    if (withdrawalReason !== undefined) {
      updateData.withdrawal_reason = withdrawalReason;
    }

    const { data, error } = await supabase
      .from('entries')
      .update(updateData)
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

export const acceptEntry = async (entryId: string) => updateEntryStatus(entryId, 'confirmed');

export const rejectEntry = async (entryId: string, reason?: string) =>
  updateEntryStatus(entryId, 'withdrawn', reason);

export const scratchEntry = async (entryId: string, reason?: string) =>
  updateEntryStatus(entryId, 'scratched', reason);

export const waitlistEntry = async (entryId: string) =>
  // Wait List membership is represented by waitlist_entries today. Until
  // promotion is unified, this preserves the existing pending-entry decision
  // behavior behind a named Entry transition.
  updateEntryStatus(entryId, 'confirmed');

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
