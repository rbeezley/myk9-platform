import { supabase, createDatabaseError } from '../supabaseClient';
import type { Database } from '@/types/supabase';
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
import { joinRowsOrEmpty } from '../_shared/readRows';

type DbTrialInsert = Database['public']['Tables']['trials']['Insert'];
type DbTrialUpdate = Database['public']['Tables']['trials']['Update'];

async function loadShowsMap(): Promise<Map<string, ReplicatedShow>> {
  return loadLookupMap(
    // A join: show labels on trials (see joinRowsOrEmpty).
    () => joinRowsOrEmpty(replicatedShowsTable.getAllShows(), 'show labels'),
    s => s.id
  );
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
    .maybeSingle();

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

/** Complete public trial catalog for signed-out show previews. */
export const getPublicTrialsByShow = async (showId: string) => postgrestGetTrialsByShow(showId);

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

// Get all trials with show information (excluding soft-deleted)
export const getAllTrials = async () => {
  return readWithReplicationFallback({
    replication: async () => {
      const [trials, showsMap] = await Promise.all([
        replicatedTrialsTable.getAllOrThrow(),
        loadShowsMap(),
      ]);
      const sortedTrials = sortedCopy(
        trials,
        compareDateAsc(trial => trial.date)
      );
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
      // A cold replication store (logged-out guest never syncs) returns null
      // WITHOUT throwing, so withReplicationFallback's catch never fires and the
      // public trial page would read as not-found. Self-fall-through to the
      // anon-safe PostgREST read (trials are a public entity — anon has direct
      // SELECT), mirroring getTrialsByShow's `if (!show)` branch.
      if (!trial) return await postgrestGetTrialById(id);
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

      // MYK9-911: a trial this device deleted keeps coming back from the server
      // until its queued DELETE uploads, and an emptied store is exactly when the
      // online verification runs. Name those ids so the read drops them.
      const locallyDeletedIds = [
        ...(await replicatedTrialsTable.pendingDeletes.coveredIds(showId)),
      ];

      if (!show) {
        const online = await postgrestGetTrialsByShow(showId);
        const gone = new Set(locallyDeletedIds);
        return {
          ...online,
          locallyDeletedIds,
          data: online.data.filter(row => !gone.has(String(row.id))),
        };
      }

      const sortedTrials = sortedCopy(
        trials,
        compareDateAsc(trial => trial.date)
      );
      const data = sortedTrials.map(trial => mapReplicatedTrialToDbRow(trial, { show }));
      return { data, error: null, locallyDeletedIds };
    },
    postgrest: () => postgrestGetTrialsByShow(showId),
    table: 'trial',
    operation: 'select_by_show',
    errorData: [],
    verifyOnlineWhenEmpty: true,
    errorOnOnlineVerificationFailure: true,
  });
};

// Search trials by name (excluding soft-deleted)
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

// Soft delete a trial and everything under it, through soft_delete_trial. The
// server stamps deleted_by from auth.uid() and refuses (MK010) a trial holding paid or
// scored entries; a direct update of deleted_at is refused by the direct-write trigger.
export const deleteTrial = async (
  id: string,
  deletedBy?: string,
  options: { override?: boolean } = {}
) => {
  void deletedBy;
  return await supabase
    .rpc('soft_delete_trial', {
      p_trial_id: id,
      ...(options.override ? { p_override: true } : {}),
    })
    .single();
};

// Hard delete a trial (permanent removal)
export const hardDeleteTrial = async (id: string) => {
  return await supabase.from('trials').delete().eq('id', id);
};

// Restore a soft-deleted trial with the rows that went with it: a site admin, or the
// deleter inside the Undo window (restore_trial).
export const restoreTrial = async (id: string, restoredBy?: string) => {
  void restoredBy;
  return await supabase.rpc('restore_trial', { p_trial_id: id }).single();
};

// Get soft-deleted trials (admin only)
export const getDeletedTrials = async () => {
  return await supabase
    .from('trials')
    .select(
      `
      *,
      show:shows (id, name)
    `
    )
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });
};
