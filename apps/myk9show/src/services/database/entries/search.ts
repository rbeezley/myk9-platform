/**
 * Entry search and eligibility queries
 *
 * Read-only operations for searching and eligibility checks.
 * SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
 */
import { supabase, createDatabaseError, type DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from '../_shared/replication-fallback';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { buildMapFromArray } from '../_shared/maps';
import { toEntryCloseDay } from '@/features/payments/entryCloseDeadline';
import { getEntryWindowTimezone } from '@/utils/entryWindowDate';

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

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
    .select('entry_close_date, status, trials(timezone, date, id)')
    .eq('id', showId)
    .single();

  if (error || !show) {
    return { canModify: false, reason: 'Show not found' };
  }

  if (
    isEntryCloseDayPast(
      show.entry_close_date,
      new Date(),
      getEntryWindowTimezone(show.trials ?? undefined)
    )
  ) {
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
  now: Date = new Date(),
  timeZone = 'America/New_York'
): boolean {
  const closeDay = toEntryCloseDay(closeDateValue);
  if (!closeDay) return false;

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return today > closeDay;
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

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

        const trials = await replicatedTrialsTable.getTrialsByShow(showId);
        if (isEntryCloseDayPast(show.entryCloseDate, new Date(), getEntryWindowTimezone(trials))) {
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
