/**
 * Secretary Entry Management Queries
 *
 * Database queries for trial secretaries to manage show entries.
 * Note: Each row in the entries table represents one dog's entry into one class.
 */

import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import {
  replicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication/ReplicatedEntriesTable';
import { getReplicatedSecretaryEntriesForShow } from './secretaryReadReplication';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { CheckInStatus } from '@myk9/core';
import type { TablesUpdate } from '@/types/supabase';
import type { PendingEntry, SecretaryStatusEntrySeed } from './secretaryTypes';
import { postgrestGetSecretaryEntriesForShow } from './secretaryPostgrest';

export type { PendingEntry, SecretaryEntry, SecretaryStatusEntrySeed } from './secretaryTypes';

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
    entry_status: (row.entry_status as string | null) ?? null,
    check_in_status: (row.check_in_status as string | null) ?? null,
  };
}

export const getPendingEntries = async (showIdFilter?: string): Promise<PendingEntry[]> => {
  let query = supabase
    .from('entries')
    .select(
      'id, show_id, submitted_at, entry_status, check_in_status, dogs(call_name), people(first_name, last_name), classes(name), shows(name)'
    )
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
    const result = await getReplicatedSecretaryEntriesForShow(showId);
    logQuery('entries', 'get_entries_for_show', Date.now() - startTime);
    return result;
  } catch {
    try {
      return await postgrestGetSecretaryEntriesForShow(
        showId,
        startTime,
        'get_entries_for_show_fallback'
      );
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'entries', 'get_entries_for_show');
      logQuery('entries', 'get_entries_for_show', duration, dbError.message);
      return { data: [], error: dbError };
    }
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
function buildReplicatedEntryStatusUpdate(
  status: EntryStatus,
  withdrawalReason?: string
): Partial<ReplicatedEntry> {
  const updateData: Partial<ReplicatedEntry> = {
    entryStatus: status,
    entry_status: status,
    status,
  };

  if (status === 'scratched') {
    updateData.checkInStatus = 'pulled';
    updateData.check_in_status = 'pulled';
  }

  if (withdrawalReason !== undefined) {
    updateData.withdrawalReason = withdrawalReason;
    updateData.withdrawal_reason = withdrawalReason;
  }

  return updateData;
}

function toEntryMutationResult(
  entryId: string,
  mutationId: string | null,
  entry: ReplicatedEntry | null
) {
  return {
    id: entryId,
    show_id: entry?.showId ?? null,
    class_id: entry?.classId ?? null,
    mutationId,
  };
}

export const updateEntryStatus = async (
  entryId: string,
  status: EntryStatus,
  withdrawalReason?: string,
  sourceEntry?: SecretaryStatusEntrySeed
) => {
  const startTime = Date.now();

  try {
    const mutationId = await replicatedEntriesTable.updateSecretaryLifecycleStatus(
      entryId,
      buildReplicatedEntryStatusUpdate(status, withdrawalReason),
      sourceEntry
    );
    const entry = await replicatedEntriesTable.getEntryById(entryId);

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_entry_status', duration);

    return { data: toEntryMutationResult(entryId, mutationId, entry), error: null };
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
    const updateData = buildReplicatedEntryStatusUpdate(status);
    const data = await Promise.all(
      entryIds.map(async entryId => {
        const mutationId = await replicatedEntriesTable.updateSecretaryLifecycleStatus(
          entryId,
          updateData
        );
        const entry = await replicatedEntriesTable.getEntryById(entryId);
        return toEntryMutationResult(entryId, mutationId, entry);
      })
    );

    const duration = Date.now() - startTime;
    logQuery('entries', 'bulk_update_status', duration);

    return { data, error: null };
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
    const updateData: TablesUpdate<'entries'> = {
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
