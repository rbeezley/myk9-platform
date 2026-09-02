/**
 * Entry statistics, search, and eligibility queries
 *
 * Read-only operations for statistics aggregation, searching, and eligibility checks.
 * SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
 */
import { supabase, createDatabaseError, logQuery, type DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from '../_shared/replication-fallback';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { buildMapFromArray } from '../_shared/maps';
import {
  buildReplicatedUserEntryRows,
  findMissingReplicatedUserEntryRelations,
} from './userEntriesReplication';
import { hasScoredResult } from './resultVisibility';
import { selectOwnedDogIds } from '@/utils/dogOwnership';
import { toEntryCloseDay } from '@/features/payments/entryCloseDeadline';

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

/**
 * Columns the MyEntries mapper reads (transformEntry). Keep in sync with the
 * replication path — a dropped column silently renders as a default on the
 * PostgREST fallback (e.g. a missing `check_in_status` reads as "Not Checked In"
 * even after a persisted check-in).
 */
export const USER_ENTRIES_SELECT = `
      id,
      dog_id,
      show_id,
      class_id,
      trial_id,
      handler,
      handler_id,
      payment_status,
      payment_method,
      entry_status,
      check_in_status,
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
      class_results_released_at,
      dog_image_url,
      deleted_at,
      refund_amount,
      refunded_at,
      submitted_at,
      created_at,
      updated_at,
      registration_id,
      registration:registration_id (
        id,
        confirmation_number,
        payment_status,
        payment_reference,
        paid_amount
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
        deleted_at,
        start_date,
        end_date,
        entry_close_date,
        venue_name,
        city,
        state,
        trials:trials (
          id,
          date,
          timezone
        )
      ),
      class:class_id (
        id,
        name,
        class_number,
        trial:trial_id (
          id,
          trial_type,
          date,
          trial_number,
          timezone
        )
      ),
      trial:trial_id (
        id,
        trial_type,
        date,
        trial_number,
        timezone
      )
    `;

// Routes own-entry reads through the cascade-aware authenticated view so scored
// columns (final_placement, result_status, etc.) are nulled until the
// visibility cascade releases them. The view is owner-run and embeds the same
// manager/own-entry row gate as entries_select, so it keeps working after
// scored columns are revoked from the shared authenticated role.
const USER_ENTRIES_PAGE_SIZE = 1000;
const USER_ENTRIES_MAX_PAGES = 100;

async function postgrestGetUserEntries() {
  const rows: Record<string, unknown>[] = [];

  for (let page = 0; page < USER_ENTRIES_MAX_PAGES; page++) {
    const from = page * USER_ENTRIES_PAGE_SIZE;
    const to = from + USER_ENTRIES_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('view_authenticated_entry_results')
      .select(USER_ENTRIES_SELECT)
      // My Entries is OWN entries only. The view returns can_manage OR
      // is_own_entry rows, so without this filter a secretary/admin would receive
      // every manageable show entry here. is_own_entry is a SQL-resolved column
      // (handler is me OR I own the dog), so this scopes every read path —
      // including the replication-failure fallback — at the source.
      .eq('is_own_entry', true)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (error) {
      throw createDatabaseError(error, 'view_authenticated_entry_results', 'select_user_entries');
    }

    const pageRows = (data || []) as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < USER_ENTRIES_PAGE_SIZE) {
      return { data: rows, error: null };
    }
  }

  throw createDatabaseError(
    new Error(
      `User entries exceeded the ${USER_ENTRIES_MAX_PAGES * USER_ENTRIES_PAGE_SIZE} row safety limit`
    ),
    'view_authenticated_entry_results',
    'select_user_entries'
  );
}

function isOfflineFetchError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error);

  return /Failed to fetch|NetworkError|Load failed/i.test(message);
}

const SEARCH_ENTRIES_SELECT = `
  id,
  dog_id,
  show_id,
  class_id,
  trial_id,
  handler,
  handler_id,
  payment_status,
  entry_status,
  check_in_status,
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
  deleted_at,
  dog_name,
  dog_call_name,
  dog_breed,
  class_name,
  show_name,
  show_start_date
`;

function mapAuthenticatedEntrySearchRow(row: Record<string, unknown>) {
  return {
    ...row,
    dog: row.dog_id
      ? {
          id: row.dog_id,
          name: row.dog_name,
          call_name: row.dog_call_name,
          breed: row.dog_breed,
          owner: null,
        }
      : null,
    class: row.class_id
      ? {
          id: row.class_id,
          name: row.class_name,
          class_number: null,
          entry_fee: row.entry_fee,
        }
      : null,
    show: row.show_id
      ? {
          id: row.show_id,
          name: row.show_name,
          start_date: row.show_start_date,
          end_date: null,
        }
      : null,
  };
}

async function postgrestSearchEntries(searchTerm: string) {
  const { data, error } = await supabase
    .from('view_authenticated_entry_results')
    .select(SEARCH_ENTRIES_SELECT)
    .or(
      `armband.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,handler.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw createDatabaseError(error, 'view_authenticated_entry_results', 'search');
  return { data: (data || []).map(row => mapAuthenticatedEntrySearchRow(row)), error: null };
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

  if (isEntryCloseDayPast(show.entry_close_date)) {
    return { canModify: false, reason: 'Entry deadline has passed' };
  }

  if (show.status === 'completed' || show.status === 'cancelled') {
    return { canModify: false, reason: 'Show is no longer active' };
  }

  return { canModify: true };
}

/** Entry close is an inclusive calendar day, not UTC midnight. */
export function isEntryCloseDayPast(
  closeDateValue: string | null | undefined,
  now: Date = new Date()
): boolean {
  const closeDay = toEntryCloseDay(closeDateValue);
  if (!closeDay) return false;

  const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, '0')))
    .join('-');
  return today > closeDay;
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
      error: error as DatabaseError,
    };
  }
};

// Get entries for the current user
export const getUserEntries = async (userId: string) => {
  const startTime = Date.now();

  try {
    const [allEntries, dogs, classes, shows, trials] = await Promise.all([
      replicatedEntriesTable.getAll(),
      replicatedDogsTable.getAllDogs(),
      replicatedClassesTable.getAll(),
      replicatedShowsTable.getAllShows(),
      replicatedTrialsTable.getAll(),
    ]);
    const dogsMap = buildMapFromArray(dogs, d => d.id);
    const classesMap = buildMapFromArray(classes, c => c.id);
    const showsMap = buildMapFromArray(shows, s => s.id);
    const trialsMap = buildMapFromArray(trials, t => t.id);
    const ownedDogIds = selectOwnedDogIds(dogs, userId);
    const filtered = allEntries.filter(
      e => e.handlerId === userId || (e.dogId ? ownedDogIds.has(e.dogId) : false)
    );

    // If entry rows have synced before their joined class/show/dog rows, the
    // first render can show the entry card without classes. Prefer the complete
    // online join when available, but keep the partial replicated result if the
    // user is offline.
    const missingRelations = findMissingReplicatedUserEntryRelations(filtered, {
      dogsMap,
      classesMap,
      showsMap,
    });

    // The replication store syncs raw scored columns (final_placement,
    // result_status, etc.) WITHOUT the per-field visibility cascade, which is
    // not in replication scope. The replication-mapped rows null those columns
    // (see withholdScoredResultColumns), so when any own entry is scored we
    // prefer the cascade-aware server view to surface correctly-RELEASED
    // results. Offline (view unreachable) we fall back to the nulled
    // replication rows — safe-by-default: withheld results never leak.
    const hasScoredEntries = filtered.some(hasScoredResult);

    if (filtered.length === 0 || missingRelations.length > 0 || hasScoredEntries) {
      try {
        // postgrestGetUserEntries scopes to own entries in SQL
        // (is_own_entry = true), so this returns the complete authoritative set
        // — including own entries not yet in the local replication snapshot —
        // without leaking manageable-not-own rows.
        const result = await postgrestGetUserEntries();
        logQuery(
          'entries',
          filtered.length === 0
            ? 'select_user_entries_empty_replica_fallback'
            : 'select_user_entries_fallback',
          Date.now() - startTime
        );
        return result;
      } catch (error) {
        if (filtered.length === 0 && !isOfflineFetchError(error)) {
          const dbError = createDatabaseError(error, 'entries', 'select_user_entries');
          logQuery(
            'entries',
            'select_user_entries_empty_replica_error',
            Date.now() - startTime,
            dbError.message
          );
          return { data: [], error: dbError as DatabaseError };
        }

        // Permanently-missing relation rows will try the online join on each
        // load; when offline or blocked, the replicated rows still keep the
        // exhibitor's entries available.
        const partialReplicationResult = await buildReplicatedUserEntryRows(filtered, {
          dogsMap,
          classesMap,
          showsMap,
          trialsMap,
        });
        logQuery(
          'entries',
          filtered.length === 0
            ? 'select_user_entries_empty_replica_offline'
            : 'select_user_entries_partial',
          Date.now() - startTime
        );
        return partialReplicationResult;
      }
    }

    const partialReplicationResult = await buildReplicatedUserEntryRows(filtered, {
      dogsMap,
      classesMap,
      showsMap,
      trialsMap,
    });
    logQuery('entries', 'select_user_entries', Date.now() - startTime);
    return partialReplicationResult;
  } catch {
    try {
      const result = await postgrestGetUserEntries();
      logQuery('entries', 'select_user_entries_fallback', Date.now() - startTime);
      return result;
    } catch (error) {
      const dbError = createDatabaseError(error, 'entries', 'select_user_entries');
      logQuery('entries', 'select_user_entries', Date.now() - startTime, dbError.message);
      return { data: [], error: dbError as DatabaseError };
    }
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
    return { data: [], error: error as DatabaseError };
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

        if (isEntryCloseDayPast(show.entryCloseDate)) {
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
