// Show-related database queries
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import type { DbShowInsert, DbShowUpdate } from '../../../types/database-mappings';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedClubsTable } from '@/services/replication/ReplicatedClubsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedJudgeAssignmentsTable } from '@/services/replication/ReplicatedJudgeAssignmentsTable';
import { mapReplicatedShowToDbRow } from '@/services/mappers/showMappers';
import { buildMapFromArray } from './queryUtils';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedClub } from '@/services/replication/ReplicatedClubsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedJudgeAssignment } from '@/services/replication/ReplicatedJudgeAssignmentsTable';

// ---------------------------------------------------------------------------
// Helpers — batch-load related data into Maps to avoid N+1 reads
// ---------------------------------------------------------------------------

const EMPTY_JUDGE_MAP = new Map<string, ReplicatedJudgeAssignment[]>();
const EMPTY_TRIALS_MAP = new Map<string, ReplicatedTrial[]>();

async function loadClubsMap(): Promise<Map<string, ReplicatedClub>> {
  const clubs = await replicatedClubsTable.getAllClubs();
  return buildMapFromArray(clubs, c => c.id);
}

async function loadTrialsByShowMap(): Promise<Map<string, ReplicatedTrial[]>> {
  const trials = await replicatedTrialsTable.getAll();
  const map = new Map<string, ReplicatedTrial[]>();
  for (const t of trials) {
    if (t.showId) {
      const list = map.get(t.showId) ?? [];
      list.push(t);
      map.set(t.showId, list);
    }
  }
  return map;
}

async function loadJudgeAssignmentsByShowMap(): Promise<Map<string, ReplicatedJudgeAssignment[]>> {
  const assignments = await replicatedJudgeAssignmentsTable.getAll();
  const map = new Map<string, ReplicatedJudgeAssignment[]>();
  for (const a of assignments) {
    if (a.showId) {
      const list = map.get(a.showId) ?? [];
      list.push(a);
      map.set(a.showId, list);
    }
  }
  return map;
}

/**
 * Map an array of ReplicatedShow to DB-row-shaped objects using pre-loaded
 * lookup maps. Set `clubDetail` to true for the detailed club sub-object.
 */
function mapShowsWithJoins(
  shows: ReplicatedShow[],
  clubsMap: Map<string, ReplicatedClub>,
  trialsMap: Map<string, ReplicatedTrial[]>,
  judgeAssignmentsMap: Map<string, ReplicatedJudgeAssignment[]>,
  clubDetail = false
): Record<string, unknown>[] {
  return shows.map(show =>
    mapReplicatedShowToDbRow(show, {
      club: show.clubId ? (clubsMap.get(show.clubId) ?? null) : null,
      trials: trialsMap.get(show.id) ?? [],
      judgeAssignments: judgeAssignmentsMap.get(show.id) ?? [],
      clubDetail,
    })
  );
}

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

async function postgrestGetAllShows() {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status,
        trial_type,
        max_entries_per_dog,
        max_total_entries,
        max_entries_per_handler
      ),
      judge_assignments(
        id,
        person_id,
        show_id,
        trial_id,
        class_id,
        status,
        invited_at,
        confirmed_at,
        fee,
        notes,
        judge:people(
          id,
          first_name,
          last_name,
          email
        )
      )
    `
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_all');
  return { data: data || [], error: null };
}

async function postgrestGetUpcomingShows(limit: number) {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status
      )
    `
    )
    .gte('start_date', today)
    .is('deleted_at', null)
    .order('start_date', { ascending: true })
    .limit(limit);

  if (error) throw createDatabaseError(error, 'show', 'select_upcoming');
  return { data: data || [], error: null };
}

async function postgrestGetShowsByDateRange(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status
      )
    `
    )
    .gte('start_date', startDate)
    .lte('end_date', endDate)
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_by_date_range');
  return { data: data || [], error: null };
}

async function postgrestGetShowsByClub(clubId: string) {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status
      )
    `
    )
    .eq('club_id', clubId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (error) throw createDatabaseError(error, 'show', 'select_by_club');
  return { data: data || [], error: null };
}

async function postgrestSearchShows(searchTerm: string) {
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .or(
      `name.ilike.%${sanitizePostgRESTFilter(searchTerm)}%,location.ilike.%${sanitizePostgRESTFilter(searchTerm)}%`
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'search');
  return { data: data || [], error: null };
}

async function postgrestGetShowStatistics() {
  const { error, count } = await supabase
    .from('shows')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (error) throw createDatabaseError(error, 'show', 'statistics');
  return { data: { total: count || 0 }, error: null };
}

async function postgrestGetShowsWithEntryCounts() {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        logo_url,
        cover_image_url,
        accent_color
      )
    `
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_with_entry_counts');
  const dataWithCounts =
    data?.map(show => ({
      ...show,
      entry_count: 0,
    })) || [];
  return { data: dataWithCounts, error: null };
}

async function postgrestGetShowsByStatus(status: string) {
  const { data, error } = await supabase
    .from('shows')
    .select('*')
    .eq('status', status)
    .is('deleted_at', null)
    .order('start_date', { ascending: true });

  if (error) throw createDatabaseError(error, 'show', 'select_by_status');
  return { data: data || [], error: null };
}

async function postgrestGetSecretaryShows() {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      id,
      name,
      start_date,
      end_date
    `
    )
    .is('deleted_at', null)
    .order('start_date', { ascending: false });

  if (error) throw createDatabaseError(error, 'show', 'select_secretary_shows');
  return { data: data || [], error: null };
}

async function postgrestGetShowById(id: string) {
  const { data, error } = await supabase
    .from('shows')
    .select(
      `
      *,
      club:clubs(
        id,
        name,
        address,
        phone,
        email,
        website,
        logo_url,
        cover_image_url,
        accent_color
      ),
      trials(
        id,
        name,
        date,
        trial_number,
        status,
        trial_type,
        max_entries_per_dog,
        max_total_entries,
        max_entries_per_handler
      ),
      judge_assignments(
        id,
        person_id,
        show_id,
        trial_id,
        class_id,
        status,
        invited_at,
        confirmed_at,
        fee,
        notes,
        judge:people(
          id,
          first_name,
          last_name,
          email
        )
      )
    `
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) throw createDatabaseError(error, 'show', 'select_by_id');
  return { data, error: null };
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

// Get all shows with club and trial information (excluding soft-deleted)
export const getAllShows = async () => {
  const startTime = Date.now();

  try {
    const [shows, clubsMap, trialsMap, judgeAssignmentsMap] = await Promise.all([
      replicatedShowsTable.getAllShows(),
      loadClubsMap(),
      loadTrialsByShowMap(),
      loadJudgeAssignmentsByShowMap(),
    ]);

    const data = mapShowsWithJoins(shows, clubsMap, trialsMap, judgeAssignmentsMap);

    const duration = Date.now() - startTime;
    logQuery('show', 'select_all_detailed', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store fails
    try {
      const result = await postgrestGetAllShows();
      const duration = Date.now() - startTime;
      logQuery('show', 'select_all_detailed_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_all');
      logQuery('show', 'select_all_detailed', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get show by ID with complete details (excluding soft-deleted)
export const getShowById = async (id: string) => {
  const startTime = Date.now();

  try {
    const show = await replicatedShowsTable.getShowById(id);
    if (!show) {
      const duration = Date.now() - startTime;
      logQuery('show', 'select_by_id_complete', duration);
      return { data: null, error: null };
    }

    const [club, trials, judgeAssignments] = await Promise.all([
      show.clubId ? replicatedClubsTable.getClubById(show.clubId) : Promise.resolve(null),
      replicatedTrialsTable.getTrialsByShow(id),
      replicatedJudgeAssignmentsTable.getByShowId(id),
    ]);

    const data = mapReplicatedShowToDbRow(show, {
      club,
      trials,
      judgeAssignments,
      clubDetail: true,
    });

    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_id_complete', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestGetShowById(id);
      const duration = Date.now() - startTime;
      logQuery('show', 'select_by_id_complete_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_by_id');
      logQuery('show', 'select_by_id_complete', duration, dbError.message);
      return { data: null, error: dbError };
    }
  }
};

// Get upcoming shows (excluding soft-deleted)
export const getUpcomingShows = async (limit = 10) => {
  const startTime = Date.now();

  try {
    const [shows, clubsMap, trialsMap] = await Promise.all([
      replicatedShowsTable.getUpcomingShows(),
      loadClubsMap(),
      loadTrialsByShowMap(),
    ]);

    const limited = shows.slice(0, limit);
    const data = mapShowsWithJoins(limited, clubsMap, trialsMap, EMPTY_JUDGE_MAP);

    const duration = Date.now() - startTime;
    logQuery('show', 'select_upcoming', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestGetUpcomingShows(limit);
      const duration = Date.now() - startTime;
      logQuery('show', 'select_upcoming_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_upcoming');
      logQuery('show', 'select_upcoming', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get shows by date range (excluding soft-deleted)
export const getShowsByDateRange = async (startDate: string, endDate: string) => {
  const startTime = Date.now();

  try {
    const [allShows, clubsMap, trialsMap] = await Promise.all([
      replicatedShowsTable.getAllShows(),
      loadClubsMap(),
      loadTrialsByShowMap(),
    ]);

    const filtered = allShows.filter(
      show => show.startDate >= startDate && show.endDate <= endDate
    );

    const data = mapShowsWithJoins(filtered, clubsMap, trialsMap, EMPTY_JUDGE_MAP);

    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_date_range', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestGetShowsByDateRange(startDate, endDate);
      const duration = Date.now() - startTime;
      logQuery('show', 'select_by_date_range_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_by_date_range');
      logQuery('show', 'select_by_date_range', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get shows by club (excluding soft-deleted)
export const getShowsByClub = async (clubId: string) => {
  const startTime = Date.now();

  try {
    const [shows, clubsMap, trialsMap] = await Promise.all([
      replicatedShowsTable.getShowsByClub(clubId),
      loadClubsMap(),
      loadTrialsByShowMap(),
    ]);

    // Sort descending by start_date (matching original PostgREST behavior)
    shows.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    const data = mapShowsWithJoins(shows, clubsMap, trialsMap, EMPTY_JUDGE_MAP);

    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_club', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestGetShowsByClub(clubId);
      const duration = Date.now() - startTime;
      logQuery('show', 'select_by_club_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_by_club');
      logQuery('show', 'select_by_club', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Search shows by name or location (excluding soft-deleted)
export const searchShows = async (searchTerm: string) => {
  const startTime = Date.now();

  try {
    const allShows = await replicatedShowsTable.getAllShows();
    const term = searchTerm.toLowerCase();

    const filtered = allShows.filter(
      show =>
        show.name.toLowerCase().includes(term) ||
        (show.location && show.location.toLowerCase().includes(term))
    );

    // Return bare rows (no joins) matching original searchShows select('*')
    const data = filtered.map(show => mapReplicatedShowToDbRow(show));

    const duration = Date.now() - startTime;
    logQuery('show', 'search', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestSearchShows(searchTerm);
      const duration = Date.now() - startTime;
      logQuery('show', 'search_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'search');
      logQuery('show', 'search', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get show statistics (excluding soft-deleted)
export const getShowStatistics = async () => {
  const startTime = Date.now();

  try {
    const allShows = await replicatedShowsTable.getAllShows();

    const stats = {
      total: allShows.length,
    };

    const duration = Date.now() - startTime;
    logQuery('show', 'statistics', duration);
    return { data: stats, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestGetShowStatistics();
      const duration = Date.now() - startTime;
      logQuery('show', 'statistics_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'statistics');
      logQuery('show', 'statistics', duration, dbError.message);
      return { data: null, error: dbError };
    }
  }
};

// Get shows with entry counts (simplified, excluding soft-deleted)
export const getShowsWithEntryCounts = async () => {
  const startTime = Date.now();

  try {
    const [shows, clubsMap] = await Promise.all([
      replicatedShowsTable.getAllShows(),
      loadClubsMap(),
    ]);

    const rows = mapShowsWithJoins(shows, clubsMap, EMPTY_TRIALS_MAP, EMPTY_JUDGE_MAP);

    // Add basic entry count as 0 for now (matching original behavior)
    const data = rows.map(row => ({
      ...row,
      entry_count: 0,
    }));

    const duration = Date.now() - startTime;
    logQuery('show', 'select_with_entry_counts', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestGetShowsWithEntryCounts();
      const duration = Date.now() - startTime;
      logQuery('show', 'select_with_entry_counts_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_with_entry_counts');
      logQuery('show', 'select_with_entry_counts', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get shows by status (excluding soft-deleted)
export const getShowsByStatus = async (status: string) => {
  const startTime = Date.now();

  try {
    const allShows = await replicatedShowsTable.getAllShows();
    const filtered = allShows.filter(show => show.status === status);

    // Return bare rows (no joins) matching original getShowsByStatus select('*')
    const data = filtered.map(show => mapReplicatedShowToDbRow(show));

    const duration = Date.now() - startTime;
    logQuery('show', 'select_by_status', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestGetShowsByStatus(status);
      const duration = Date.now() - startTime;
      logQuery('show', 'select_by_status_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_by_status');
      logQuery('show', 'select_by_status', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get shows where user is a secretary (excluding soft-deleted)
export const getSecretaryShows = async (_userId: string) => {
  const startTime = Date.now();

  try {
    const allShows = await replicatedShowsTable.getAllShows();

    // Sort descending by start_date (matching original PostgREST behavior)
    const sorted = [...allShows].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    // Return only the fields the original query selected
    const data = sorted.map(show => ({
      id: show.id,
      name: show.name,
      start_date: show.startDate,
      end_date: show.endDate,
    }));

    const duration = Date.now() - startTime;
    logQuery('show', 'select_secretary_shows', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store unavailable
    try {
      const result = await postgrestGetSecretaryShows();
      const duration = Date.now() - startTime;
      logQuery('show', 'select_secretary_shows_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'show', 'select_secretary_shows');
      logQuery('show', 'select_secretary_shows', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// ---------------------------------------------------------------------------
// Mutation functions — remain on PostgREST (DO NOT CHANGE)
// ---------------------------------------------------------------------------

// Create new show
export const createShow = async (showData: DbShowInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows')
      .insert([showData])
      .select(
        `
        *,
        club:clubs(
          id,
          name,
          address,
          logo_url,
          cover_image_url,
          accent_color
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'insert');
    logQuery('show', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update show
export const updateShow = async (id: string, updates: DbShowUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `
        *,
        club:clubs(
          id,
          name,
          address,
          logo_url,
          cover_image_url,
          accent_color
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'update');
    logQuery('show', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Soft delete show
export const deleteShow = async (id: string, deletedBy?: string) => {
  const startTime = Date.now();

  try {
    const updateData: Record<string, unknown> = {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (deletedBy) {
      updateData.deleted_by = deletedBy;
    }

    const { data, error } = await supabase
      .from('shows')
      .update(updateData)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, name')
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'soft_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'soft_delete');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'soft_delete');
    logQuery('show', 'soft_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Hard delete show (permanent removal)
export const hardDeleteShow = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.from('shows').delete().eq('id', id).select('id, name');

    const duration = Date.now() - startTime;
    logQuery('show', 'hard_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'hard_delete');
    }

    const deletedShow = Array.isArray(data) ? data[0] : data;
    return { data: deletedShow || null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'hard_delete');
    logQuery('show', 'hard_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Restore soft-deleted show (admin only)
export const restoreShow = async (id: string, restoredBy?: string) => {
  const startTime = Date.now();

  try {
    const updateData: Record<string, unknown> = {
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    };

    if (restoredBy) {
      updateData.updated_by = restoredBy;
    }

    const { data, error } = await supabase
      .from('shows')
      .update(updateData)
      .eq('id', id)
      .select('id, name')
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'restore', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'restore');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'restore');
    logQuery('show', 'restore', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get soft-deleted shows (admin only)
export const getDeletedShows = async () => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    const duration = Date.now() - startTime;
    logQuery('show', 'select_deleted', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'select_deleted');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'select_deleted');
    logQuery('show', 'select_deleted', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

// Legacy hard delete show (kept for compatibility)
export const legacyDeleteShow = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('shows')
      .delete()
      .eq('id', id)
      .select('id, name')
      .single();

    const duration = Date.now() - startTime;
    logQuery('show', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'show', 'delete');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'show', 'delete');
    logQuery('show', 'delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
