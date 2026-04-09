// Trial-related database queries
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.
import { supabase, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { mapReplicatedTrialToDbRow } from '@/services/mappers/trialMappers';
import { buildMapFromArray } from './queryUtils';
import { withReplicationFallback } from './replicationUtils';
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
  try {
    return await withReplicationFallback(
      async () => {
        const [trials, showsMap] = await Promise.all([
          replicatedTrialsTable.getAll(),
          loadShowsMap(),
        ]);
        // Sort by date ascending (matching original PostgREST behavior)
        trials.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const data = mapTrialsWithJoins(trials, showsMap);
        return { data, error: null };
      },
      postgrestGetAllTrials,
      'trial',
      'select_all'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'trial', 'select_all') };
  }
};

// Get trial by ID (excluding soft-deleted)
export const getTrialById = async (id: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const trial = await replicatedTrialsTable.getTrialById(id);
        if (!trial) return { data: null, error: null };
        const show = trial.showId ? await replicatedShowsTable.getShowById(trial.showId) : null;
        const data = mapReplicatedTrialToDbRow(trial, { show });
        return { data, error: null };
      },
      () => postgrestGetTrialById(id),
      'trial',
      'select_by_id'
    );
  } catch (error) {
    return { data: null, error: createDatabaseError(error, 'trial', 'select_by_id') };
  }
};

// Get trials by show ID (excluding soft-deleted)
export const getTrialsByShow = async (showId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [trials, show] = await Promise.all([
          replicatedTrialsTable.getTrialsByShow(showId),
          replicatedShowsTable.getShowById(showId),
        ]);
        const data = trials.map(trial => mapReplicatedTrialToDbRow(trial, { show }));
        return { data, error: null };
      },
      () => postgrestGetTrialsByShow(showId),
      'trial',
      'select_by_show'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'trial', 'select_by_show') };
  }
};

// Search trials by name (excluding soft-deleted)
export const searchTrials = async (searchTerm: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [allTrials, showsMap] = await Promise.all([
          replicatedTrialsTable.getAll(),
          loadShowsMap(),
        ]);
        const term = searchTerm.toLowerCase();
        const filtered = allTrials.filter(trial => trial.name.toLowerCase().includes(term));
        const data = mapTrialsWithJoins(filtered, showsMap);
        return { data, error: null };
      },
      () => postgrestSearchTrials(searchTerm),
      'trial',
      'search'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'trial', 'search') };
  }
};

// Get trials by status (excluding soft-deleted)
export const getTrialsByStatus = async (status: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [allTrials, showsMap] = await Promise.all([
          replicatedTrialsTable.getAll(),
          loadShowsMap(),
        ]);
        const filtered = allTrials.filter(trial => trial.status === status);
        // Sort by date ascending (matching original PostgREST behavior)
        filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const data = mapTrialsWithJoins(filtered, showsMap);
        return { data, error: null };
      },
      () => postgrestGetTrialsByStatus(status),
      'trial',
      'select_by_status'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'trial', 'select_by_status') };
  }
};

// Get upcoming trials (excluding soft-deleted)
export const getUpcomingTrials = async (limit?: number) => {
  try {
    return await withReplicationFallback(
      async () => {
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
        return { data, error: null };
      },
      () => postgrestGetUpcomingTrials(limit),
      'trial',
      'select_upcoming'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'trial', 'select_upcoming') };
  }
};

// Get trials by date range (excluding soft-deleted)
export const getTrialsByDateRange = async (startDate: string, endDate: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [allTrials, showsMap] = await Promise.all([
          replicatedTrialsTable.getAll(),
          loadShowsMap(),
        ]);
        const filtered = allTrials
          .filter(trial => trial.date >= startDate && trial.date <= endDate)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const data = mapTrialsWithJoins(filtered, showsMap);
        return { data, error: null };
      },
      () => postgrestGetTrialsByDateRange(startDate, endDate),
      'trial',
      'select_by_date_range'
    );
  } catch (error) {
    return { data: [], error: createDatabaseError(error, 'trial', 'select_by_date_range') };
  }
};

// Get trial statistics (excluding soft-deleted)
export const getTrialStatistics = async () => {
  try {
    return await withReplicationFallback(
      async () => {
        const allTrials = await replicatedTrialsTable.getAll();
        const byStatus = allTrials.reduce(
          (acc: Record<string, number>, trial) => {
            const status = trial.status || 'Unknown';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
        return { data: { total: allTrials.length, byStatus }, error: null };
      },
      postgrestGetTrialStatistics,
      'trial',
      'statistics'
    );
  } catch (error) {
    return { data: null, error: createDatabaseError(error, 'trial', 'statistics') };
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
