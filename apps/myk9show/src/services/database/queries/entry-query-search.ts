/**
 * Entry statistics, search, and eligibility queries
 *
 * Read-only operations for statistics aggregation, searching, and eligibility checks.
 * SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
 */
import { supabase, createDatabaseError } from '../supabaseClient';
import { withReplicationFallback } from './replicationUtils';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { buildMapFromArray } from './queryUtils';

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

async function postgrestGetEntryStatistics(showId?: string) {
  let query = supabase
    .from('entries')
    .select('entry_status, entry_fee, payment_status')
    .is('deleted_at', null);

  if (showId) {
    query = query.eq('show_id', showId);
  }

  const { data, error } = await query;

  if (error) throw createDatabaseError(error, 'entries', 'statistics');

  // Calculate statistics
  const stats = {
    totalEntries: data?.length || 0,
    byStatus: {} as Record<string, number>,
    totalRevenue: 0,
    paidRevenue: 0,
    completionRate: 0,
  };

  if (data) {
    data.forEach(entry => {
      const status = entry.entry_status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      const fee = entry.entry_fee || 0;
      stats.totalRevenue += fee;

      if (entry.payment_status === 'paid') {
        stats.paidRevenue += fee;
      }
    });

    const completedEntries = stats.byStatus['completed'] || 0;
    const paidEntries = data.filter(e => e.payment_status === 'paid').length;
    stats.completionRate = paidEntries > 0 ? (completedEntries / paidEntries) * 100 : 0;
  }

  return { data: stats, error: null };
}

async function postgrestGetUserEntries(userId: string) {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      id,
      dog_id,
      show_id,
      class_id,
      trial_id,
      handler,
      handler_id,
      payment_status,
      entry_status,
      entry_fee,
      armband,
      run_order,
      jump_height,
      special_requests,
      is_scored,
      result_status,
      search_time_seconds,
      total_faults,
      final_placement,
      submitted_at,
      created_at,
      updated_at,
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
      show:show_id (
        id,
        name,
        start_date,
        end_date,
        venue,
        city,
        state
      ),
      class:class_id (
        id,
        name,
        class_number
      )
    `
    )
    .eq('handler_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_user_entries');
  return { data: data || [], error: null };
}

async function postgrestSearchEntries(searchTerm: string) {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      *,
      dog:dog_id (
        id,
        name,
        call_name,
        breed,
        owner:owner_id (
          id,
          first_name,
          last_name,
          email
        )
      ),
      class:class_id (
        id,
        name,
        class_number,
        entry_fee
      ),
      show:show_id (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .or(
      `armband.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,handler.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw createDatabaseError(error, 'entries', 'search');
  return { data: data || [], error: null };
}

async function postgrestCanModifyEntry(
  showId: string
): Promise<{ canModify: boolean; reason?: string }> {
  const { data: show, error } = await supabase
    .from('shows')
    .select('entry_close_date, status')
    .eq('id', showId)
    .single();

  if (error || !show) {
    return { canModify: false, reason: 'Show not found' };
  }

  const now = new Date();
  const closeDate = show.entry_close_date ? new Date(show.entry_close_date) : null;

  if (closeDate && closeDate < now) {
    return { canModify: false, reason: 'Entry deadline has passed' };
  }

  if (show.status === 'completed' || show.status === 'cancelled') {
    return { canModify: false, reason: 'Show is no longer active' };
  }

  return { canModify: true };
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

// Get entry statistics for a show
export const getEntryStatistics = async (showId?: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const entries = showId
          ? await replicatedEntriesTable.getEntriesByShow(showId)
          : await replicatedEntriesTable.getAll();

        const stats = {
          totalEntries: entries.length,
          byStatus: {} as Record<string, number>,
          totalRevenue: 0,
          paidRevenue: 0,
          completionRate: 0,
        };

        for (const entry of entries) {
          const status = entry.entryStatus || 'unknown';
          stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
          const fee = entry.entryFee || 0;
          stats.totalRevenue += fee;
          if (entry.paymentStatus === 'paid') stats.paidRevenue += fee;
        }

        const completedEntries = stats.byStatus['completed'] || 0;
        const paidEntries = entries.filter(e => e.paymentStatus === 'paid').length;
        stats.completionRate = paidEntries > 0 ? (completedEntries / paidEntries) * 100 : 0;

        return { data: stats, error: null };
      },
      () => postgrestGetEntryStatistics(showId),
      'entries',
      'statistics'
    );
  } catch (error) {
    return {
      data: { totalEntries: 0, byStatus: {}, totalRevenue: 0, paidRevenue: 0, completionRate: 0 },
      error: createDatabaseError(error, 'entries', 'statistics'),
    };
  }
};

// Get entries for the current user
export const getUserEntries = async (userId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [allEntries, dogs, classes, shows] = await Promise.all([
          replicatedEntriesTable.getAll(),
          replicatedDogsTable.getAllDogs(),
          replicatedClassesTable.getAll(),
          replicatedShowsTable.getAllShows(),
        ]);
        const dogsMap = buildMapFromArray(dogs, d => d.id);
        const classesMap = buildMapFromArray(classes, c => c.id);
        const showsMap = buildMapFromArray(shows, s => s.id);
        const filtered = allEntries.filter(e => e.handlerId === userId);
        const data = filtered.map(entry =>
          mapReplicatedEntryToDbRow(entry, {
            dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
            cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
            show: entry.showId ? (showsMap.get(entry.showId) ?? null) : null,
          })
        );
        return { data, error: null };
      },
      () => postgrestGetUserEntries(userId),
      'entries',
      'select_user_entries'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'entries', 'select_user_entries') };
  }
};

// Search entries by armband or handler name
export const searchEntries = async (searchTerm: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [allEntries, dogs, classes, shows] = await Promise.all([
          replicatedEntriesTable.getAll(),
          replicatedDogsTable.getAllDogs(),
          replicatedClassesTable.getAll(),
          replicatedShowsTable.getAllShows(),
        ]);
        const dogsMap = buildMapFromArray(dogs, d => d.id);
        const classesMap = buildMapFromArray(classes, c => c.id);
        const showsMap = buildMapFromArray(shows, s => s.id);
        const term = searchTerm.toLowerCase();
        const filtered = allEntries
          .filter(
            e =>
              (e.armband && e.armband.toLowerCase().includes(term)) ||
              (e.handler && e.handler.toLowerCase().includes(term))
          )
          .slice(0, 50);
        const data = filtered.map(entry =>
          mapReplicatedEntryToDbRow(entry, {
            dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
            cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
            show: entry.showId ? (showsMap.get(entry.showId) ?? null) : null,
          })
        );
        return { data, error: null };
      },
      () => postgrestSearchEntries(searchTerm),
      'entries',
      'search'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'entries', 'search') };
  }
};

// Check if entry can be modified (show is still accepting entries)
export const canModifyEntry = async (
  showId: string
): Promise<{ canModify: boolean; reason?: string }> => {
  try {
    return await withReplicationFallback(
      async () => {
        const show = await replicatedShowsTable.getShowById(showId);
        if (!show) return { canModify: false, reason: 'Show not found' };

        const now = new Date();
        const closeDate = show.entryCloseDate ? new Date(show.entryCloseDate) : null;
        if (closeDate && closeDate < now) {
          return { canModify: false, reason: 'Entry deadline has passed' };
        }
        if (show.status === 'completed' || show.status === 'cancelled') {
          return { canModify: false, reason: 'Show is no longer active' };
        }
        return { canModify: true };
      },
      () => postgrestCanModifyEntry(showId),
      'shows',
      'check_can_modify'
    );
  } catch {
    // Both replication and PostgREST failed — safe default: deny modification
    return { canModify: false, reason: 'Unable to verify modification eligibility' };
  }
};
