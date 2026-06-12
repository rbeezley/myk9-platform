import { supabase, createDatabaseError } from '../supabaseClient';
import type { Database, TablesUpdate } from '@/types/supabase';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { mapReplicatedTrialToDbRow } from '@/services/mappers/trialMappers';
import {
  compareDateAsc,
  loadLookupMap,
  readWithReplicationFallback,
  sortedCopy,
} from '../_shared/read-shape';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';

type DbTrialInsert = Database['public']['Tables']['trials']['Insert'];
type DbTrialUpdate = Database['public']['Tables']['trials']['Update'];

async function loadShowsMap(): Promise<Map<string, ReplicatedShow>> {
  return loadLookupMap(() => replicatedShowsTable.getAllShows(), s => s.id);
}

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
  return readWithReplicationFallback({
    replication: async () => {
      const [trials, showsMap] = await Promise.all([replicatedTrialsTable.getAll(), loadShowsMap()]);
      const sortedTrials = sortedCopy(trials, compareDateAsc(trial => trial.date));
      const data = mapTrialsWithJoins(sortedTrials, showsMap);
      return { data, error: null };
    },
    postgrest: postgrestGetAllTrials,
    table: 'trial',
    operation: 'select_all',
    errorData: [],
  });
};

// Get trial by ID (excluding soft-deleted)
export const getTrialById = async (id: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const trial = await replicatedTrialsTable.getTrialById(id);
      if (!trial) return { data: null, error: null };
      const show = trial.showId ? await replicatedShowsTable.getShowById(trial.showId) : null;
      const data = mapReplicatedTrialToDbRow(trial, { show });
      return { data, error: null };
    },
    postgrest: () => postgrestGetTrialById(id),
    table: 'trial',
    operation: 'select_by_id',
    errorData: null,
  });
};

// Get trials by show ID (excluding soft-deleted)
export const getTrialsByShow = async (showId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [trials, show] = await Promise.all([
        replicatedTrialsTable.getTrialsByShow(showId),
        replicatedShowsTable.getShowById(showId),
      ]);

      if (!show) {
        return await postgrestGetTrialsByShow(showId);
      }

      const sortedTrials = sortedCopy(trials, compareDateAsc(trial => trial.date));
      const data = sortedTrials.map(trial => mapReplicatedTrialToDbRow(trial, { show }));
      return { data, error: null };
    },
    postgrest: () => postgrestGetTrialsByShow(showId),
    table: 'trial',
    operation: 'select_by_show',
    errorData: [],
  });
};

// Search trials by name (excluding soft-deleted)
export const searchTrials = async (searchTerm: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [allTrials, showsMap] = await Promise.all([
        replicatedTrialsTable.getAll(),
        loadShowsMap(),
      ]);
      const term = searchTerm.toLowerCase();
      const filtered = allTrials.filter(trial => trial.name.toLowerCase().includes(term));
      const sortedTrials = sortedCopy(filtered, compareDateAsc(trial => trial.date));
      const data = mapTrialsWithJoins(sortedTrials, showsMap);
      return { data, error: null };
    },
    postgrest: () => postgrestSearchTrials(searchTerm),
    table: 'trial',
    operation: 'search',
    errorData: [],
  });
};

// Get trials by status (excluding soft-deleted)
export const getTrialsByStatus = async (status: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [allTrials, showsMap] = await Promise.all([
        replicatedTrialsTable.getAll(),
        loadShowsMap(),
      ]);
      const filtered = allTrials.filter(trial => trial.status === status);
      const sortedTrials = sortedCopy(filtered, compareDateAsc(trial => trial.date));
      const data = mapTrialsWithJoins(sortedTrials, showsMap);
      return { data, error: null };
    },
    postgrest: () => postgrestGetTrialsByStatus(status),
    table: 'trial',
    operation: 'select_by_status',
    errorData: [],
  });
};

// Get upcoming trials (excluding soft-deleted)
export const getUpcomingTrials = async (limit?: number) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [allTrials, showsMap] = await Promise.all([
        replicatedTrialsTable.getAll(),
        loadShowsMap(),
      ]);
      const today = new Date().toISOString().split('T')[0];
      const filtered = allTrials.filter(trial => trial.date >= today);
      const sortedTrials = sortedCopy(filtered, compareDateAsc(trial => trial.date));
      const limited = limit ? sortedTrials.slice(0, limit) : sortedTrials;
      const data = mapTrialsWithJoins(limited, showsMap);
      return { data, error: null };
    },
    postgrest: () => postgrestGetUpcomingTrials(limit),
    table: 'trial',
    operation: 'select_upcoming',
    errorData: [],
  });
};

// Get trials by date range (excluding soft-deleted)
export const getTrialsByDateRange = async (startDate: string, endDate: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [allTrials, showsMap] = await Promise.all([
        replicatedTrialsTable.getAll(),
        loadShowsMap(),
      ]);
      const filtered = allTrials.filter(trial => trial.date >= startDate && trial.date <= endDate);
      const sortedTrials = sortedCopy(filtered, compareDateAsc(trial => trial.date));
      const data = mapTrialsWithJoins(sortedTrials, showsMap);
      return { data, error: null };
    },
    postgrest: () => postgrestGetTrialsByDateRange(startDate, endDate),
    table: 'trial',
    operation: 'select_by_date_range',
    errorData: [],
  });
};

// Get trial statistics (excluding soft-deleted)
export const getTrialStatistics = async () => {
  return readWithReplicationFallback({
    replication: async () => {
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
    postgrest: postgrestGetTrialStatistics,
    table: 'trial',
    operation: 'statistics',
    errorData: null,
  });
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
  const updateData: TablesUpdate<'trials'> = {
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
  void restoredBy;

  const updateData: TablesUpdate<'trials'> = {
    deleted_at: null,
    deleted_by: null,
    updated_at: new Date().toISOString(),
  };

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
