// Trial-related database queries
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { mapReplicatedTrialToDbRow } from '@/services/mappers/trialMappers';
import { buildMapFromArray } from './queryUtils';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';

type DbTrialInsert = Database['public']['Tables']['trials']['Insert'];
type DbTrialUpdate = Database['public']['Tables']['trials']['Update'];

// ---------------------------------------------------------------------------
// Helpers — batch-load related data into Maps to avoid N+1 reads
// ---------------------------------------------------------------------------

async function loadShowsMap(): Promise<Map<string, ReplicatedShow>> {
  const shows = await replicatedShowsTable.getAllShows();
  return buildMapFromArray(shows, s => s.id);
}

/**
 * Map an array of ReplicatedTrial to DB-row-shaped objects using a pre-loaded
 * shows lookup map.
 */
function mapTrialsWithJoins(
  trials: ReplicatedTrial[],
  showsMap: Map<string, ReplicatedShow>
): Record<string, unknown>[] {
  return trials.map(trial =>
    mapReplicatedTrialToDbRow(trial, {
      show: trial.showId ? (showsMap.get(trial.showId) ?? null) : null,
    })
  );
}

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

async function postgrestGetAllTrials() {
  const { data, error } = await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .is('deleted_at', null)
    .order('date', { ascending: true });

  if (error) throw createDatabaseError(error, 'trial', 'select_all');
  return { data: data || [], error: null };
}

async function postgrestGetTrialById(id: string) {
  const { data, error } = await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) throw createDatabaseError(error, 'trial', 'select_by_id');
  return { data, error: null };
}

async function postgrestGetTrialsByShow(showId: string) {
  const { data, error } = await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .eq('show_id', showId)
    .is('deleted_at', null)
    .order('date', { ascending: true });

  if (error) throw createDatabaseError(error, 'trial', 'select_by_show');
  return { data: data || [], error: null };
}

async function postgrestSearchTrials(searchTerm: string) {
  const { data, error } = await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .ilike('name', `%${searchTerm}%`)
    .is('deleted_at', null)
    .order('date', { ascending: true });

  if (error) throw createDatabaseError(error, 'trial', 'search');
  return { data: data || [], error: null };
}

async function postgrestGetTrialsByStatus(status: string) {
  const { data, error } = await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .eq('status', status)
    .is('deleted_at', null)
    .order('date', { ascending: true });

  if (error) throw createDatabaseError(error, 'trial', 'select_by_status');
  return { data: data || [], error: null };
}

async function postgrestGetUpcomingTrials(limit?: number) {
  const today = new Date().toISOString().split('T')[0];

  let query = supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .gte('date', today)
    .is('deleted_at', null)
    .order('date', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) throw createDatabaseError(error, 'trial', 'select_upcoming');
  return { data: data || [], error: null };
}

async function postgrestGetTrialsByDateRange(startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (
        id,
        name,
        start_date,
        end_date
      )
    `
    )
    .gte('date', startDate)
    .lte('date', endDate)
    .is('deleted_at', null)
    .order('date', { ascending: true });

  if (error) throw createDatabaseError(error, 'trial', 'select_by_date_range');
  return { data: data || [], error: null };
}

async function postgrestGetTrialStatistics() {
  const totalQuery = supabase
    .from('trials')
    .select('id', { count: 'exact' })
    .is('deleted_at', null);

  const statusQuery = supabase.from('trials').select('status').is('deleted_at', null);

  const [totalResult, statusResult] = await Promise.all([totalQuery, statusQuery]);

  if (totalResult.error || statusResult.error) {
    throw createDatabaseError(totalResult.error || statusResult.error, 'trial', 'statistics');
  }

  const statusCounts =
    statusResult.data?.reduce(
      (acc: Record<string, number>, trial: { status?: string | null }) => {
        const status = trial.status || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) || {};

  return {
    data: {
      total: totalResult.count || 0,
      byStatus: statusCounts,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

// Get all trials with show information (excluding soft-deleted)
export const getAllTrials = async () => {
  const startTime = Date.now();

  try {
    const [trials, showsMap] = await Promise.all([replicatedTrialsTable.getAll(), loadShowsMap()]);

    // Sort by date ascending (matching original PostgREST behavior)
    trials.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const data = mapTrialsWithJoins(trials, showsMap);

    const duration = Date.now() - startTime;
    logQuery('trial', 'select_all', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST if replication store fails
    try {
      const result = await postgrestGetAllTrials();
      const duration = Date.now() - startTime;
      logQuery('trial', 'select_all_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'select_all');
      logQuery('trial', 'select_all', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get trial by ID (excluding soft-deleted)
export const getTrialById = async (id: string) => {
  const startTime = Date.now();

  try {
    const trial = await replicatedTrialsTable.getTrialById(id);
    if (!trial) {
      const duration = Date.now() - startTime;
      logQuery('trial', 'select_by_id', duration);
      return { data: null, error: null };
    }

    const show = trial.showId ? await replicatedShowsTable.getShowById(trial.showId) : null;

    const data = mapReplicatedTrialToDbRow(trial, { show });

    const duration = Date.now() - startTime;
    logQuery('trial', 'select_by_id', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestGetTrialById(id);
      const duration = Date.now() - startTime;
      logQuery('trial', 'select_by_id_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'select_by_id');
      logQuery('trial', 'select_by_id', duration, dbError.message);
      return { data: null, error: dbError };
    }
  }
};

// Get trials by show ID (excluding soft-deleted)
export const getTrialsByShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    const [trials, show] = await Promise.all([
      replicatedTrialsTable.getTrialsByShow(showId),
      replicatedShowsTable.getShowById(showId),
    ]);

    const data = trials.map(trial => mapReplicatedTrialToDbRow(trial, { show }));

    const duration = Date.now() - startTime;
    logQuery('trial', 'select_by_show', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestGetTrialsByShow(showId);
      const duration = Date.now() - startTime;
      logQuery('trial', 'select_by_show_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'select_by_show');
      logQuery('trial', 'select_by_show', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Search trials by name (excluding soft-deleted)
export const searchTrials = async (searchTerm: string) => {
  const startTime = Date.now();

  try {
    const [allTrials, showsMap] = await Promise.all([
      replicatedTrialsTable.getAll(),
      loadShowsMap(),
    ]);

    const term = searchTerm.toLowerCase();
    const filtered = allTrials.filter(trial => trial.name.toLowerCase().includes(term));

    const data = mapTrialsWithJoins(filtered, showsMap);

    const duration = Date.now() - startTime;
    logQuery('trial', 'search', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestSearchTrials(searchTerm);
      const duration = Date.now() - startTime;
      logQuery('trial', 'search_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'search');
      logQuery('trial', 'search', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get trials by status (excluding soft-deleted)
export const getTrialsByStatus = async (status: string) => {
  const startTime = Date.now();

  try {
    const [allTrials, showsMap] = await Promise.all([
      replicatedTrialsTable.getAll(),
      loadShowsMap(),
    ]);

    const filtered = allTrials.filter(trial => trial.status === status);

    // Sort by date ascending (matching original PostgREST behavior)
    filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const data = mapTrialsWithJoins(filtered, showsMap);

    const duration = Date.now() - startTime;
    logQuery('trial', 'select_by_status', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestGetTrialsByStatus(status);
      const duration = Date.now() - startTime;
      logQuery('trial', 'select_by_status_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'select_by_status');
      logQuery('trial', 'select_by_status', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get upcoming trials (excluding soft-deleted)
export const getUpcomingTrials = async (limit?: number) => {
  const startTime = Date.now();

  try {
    const [allTrials, showsMap] = await Promise.all([
      replicatedTrialsTable.getAll(),
      loadShowsMap(),
    ]);

    const today = new Date().toISOString().split('T')[0];
    const filtered = allTrials
      .filter(trial => trial.date >= today)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const limited = limit ? filtered.slice(0, limit) : filtered;
    const data = mapTrialsWithJoins(limited, showsMap);

    const duration = Date.now() - startTime;
    logQuery('trial', 'select_upcoming', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestGetUpcomingTrials(limit);
      const duration = Date.now() - startTime;
      logQuery('trial', 'select_upcoming_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'select_upcoming');
      logQuery('trial', 'select_upcoming', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get trials by date range (excluding soft-deleted)
export const getTrialsByDateRange = async (startDate: string, endDate: string) => {
  const startTime = Date.now();

  try {
    const [allTrials, showsMap] = await Promise.all([
      replicatedTrialsTable.getAll(),
      loadShowsMap(),
    ]);

    const filtered = allTrials
      .filter(trial => trial.date >= startDate && trial.date <= endDate)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const data = mapTrialsWithJoins(filtered, showsMap);

    const duration = Date.now() - startTime;
    logQuery('trial', 'select_by_date_range', duration);
    return { data, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestGetTrialsByDateRange(startDate, endDate);
      const duration = Date.now() - startTime;
      logQuery('trial', 'select_by_date_range_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'select_by_date_range');
      logQuery('trial', 'select_by_date_range', duration, dbError.message);
      return { data: [], error: dbError };
    }
  }
};

// Get trial statistics (excluding soft-deleted)
export const getTrialStatistics = async () => {
  const startTime = Date.now();

  try {
    const allTrials = await replicatedTrialsTable.getAll();

    const byStatus = allTrials.reduce(
      (acc: Record<string, number>, trial) => {
        const status = trial.status || 'Unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const stats = {
      total: allTrials.length,
      byStatus,
    };

    const duration = Date.now() - startTime;
    logQuery('trial', 'statistics', duration);
    return { data: stats, error: null };
  } catch {
    // Fallback to PostgREST
    try {
      const result = await postgrestGetTrialStatistics();
      const duration = Date.now() - startTime;
      logQuery('trial', 'statistics_fallback', duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const dbError = createDatabaseError(error, 'trial', 'statistics');
      logQuery('trial', 'statistics', duration, dbError.message);
      return { data: null, error: dbError };
    }
  }
};

// ---------------------------------------------------------------------------
// Mutation functions — remain on PostgREST (DO NOT CHANGE)
// ---------------------------------------------------------------------------

// Create a new trial
export const createTrial = async (trialData: DbTrialInsert) => {
  return await supabase.from('trials').insert([trialData]).select().single();
};

// Update a trial
export const updateTrial = async (id: string, updates: DbTrialUpdate) => {
  return await supabase
    .from('trials')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
};

// Soft delete a trial
export const deleteTrial = async (id: string, deletedBy?: string) => {
  const updateData: Record<string, unknown> = {
    deleted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (deletedBy) {
    updateData.deleted_by = deletedBy;
  }

  return await supabase
    .from('trials')
    .update(updateData)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, name')
    .single();
};

// Hard delete a trial (permanent removal)
export const hardDeleteTrial = async (id: string) => {
  return await supabase.from('trials').delete().eq('id', id);
};

// Restore a soft-deleted trial (admin only)
export const restoreTrial = async (id: string, restoredBy?: string) => {
  const updateData: Record<string, unknown> = {
    deleted_at: null,
    deleted_by: null,
    updated_at: new Date().toISOString(),
  };

  if (restoredBy) {
    updateData.updated_by = restoredBy;
  }

  return await supabase.from('trials').update(updateData).eq('id', id).select('id, name').single();
};

// Get soft-deleted trials (admin only)
export const getDeletedTrials = async () => {
  return await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (id, name),
      deleted_by_user:deleted_by (id, first_name, last_name, email)
    `
    )
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
};
