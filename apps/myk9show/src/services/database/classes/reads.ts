// Class Database Query Layer - Phase 2.5: Class Store Integration
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.

import { supabase, createDatabaseError } from '../supabaseClient';
import {
  compareStringAscNullsLast,
  loadLookupMap,
  readWithReplicationFallback,
  sortedCopy,
} from '../_shared/read-shape';
import type { DbClassInsert, DbClassUpdate } from '@/types/database-mappings';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import {
  mapReplicatedClassToDbRow,
  mapReplicatedEntryToDetailRow,
} from '@/services/mappers/classMappers';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { buildMapFromArray } from '../_shared/maps';

// ---------------------------------------------------------------------------
// Helpers — batch-load related data into Maps to avoid N+1 reads
// ---------------------------------------------------------------------------

async function loadTrialsMap(): Promise<Map<string, ReplicatedTrial>> {
  return loadLookupMap(
    () => replicatedTrialsTable.getAll(),
    t => t.id
  );
}

async function loadEntryCountsByClassMap(): Promise<Map<string, number>> {
  const entries = await replicatedEntriesTable.getAll();
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.classId) {
      map.set(e.classId, (map.get(e.classId) ?? 0) + 1);
    }
  }
  return map;
}

/**
 * Map an array of ReplicatedClass to DB-row-shaped objects using pre-loaded
 * lookup maps.
 */
function mapClassesWithJoins(
  classes: ReplicatedClass[],
  trialsMap: Map<string, ReplicatedTrial>,
  entryCountsMap: Map<string, number>
): Record<string, unknown>[] {
  return classes.map(cls => {
    const trial = cls.trialId ? (trialsMap.get(cls.trialId) ?? null) : null;

    // Build judge_assignments from denormalized fields on ReplicatedClass
    const judgeAssignments =
      cls.judgeId && cls.judgeName
        ? [
            {
              person_id: cls.judgeId,
              people: {
                first_name: cls.judgeName.split(' ')[0] || '',
                last_name: cls.judgeName.split(' ').slice(1).join(' ') || '',
              },
            },
          ]
        : [];

    return mapReplicatedClassToDbRow(cls, {
      trial: trial
        ? {
            id: trial.id,
            name: trial.name,
            date: trial.date,
            ...(trial.trialNumber != null && { trialNumber: trial.trialNumber }),
            ...(trial.status != null && { status: trial.status }),
          }
        : null,
      entryCount: entryCountsMap.get(cls.id) ?? 0,
      judgeAssignments,
    });
  });
}

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

/**
 * Explicit column list for the PostgREST class reads below. MYK9-116.
 *
 * These readers are the cold-replication-store fallback, and a logged-out guest
 * ALWAYS lands here (guest sync never runs), so they execute as the Postgres
 * `anon` role on public show / class-details / results routes.
 *
 * `20260730140000_anon_classes_hide_column_allowlist.sql` replaced anon's
 * table-wide SELECT on `classes` with a column allowlist that withholds the
 * scent-work hide secrets. PostgREST expands `select=*` to every column in the
 * TABLE, not every column the caller is granted — so a `*` here is a hard 42501
 * for every guest, and on `getAllClasses` it degrades silently to an empty class
 * list. Name the columns instead.
 *
 * Deliberately omits `num_hides`, `has_blank` and `hides_known`: a competitor
 * must not learn the hide count or whether an area is blank before running the
 * class. No consumer of these readers reads them — ringside scoring gets
 * `hidesKnown` from the replication store, which syncs as `authenticated`.
 *
 * Written as a single LITERAL string, never `columns.join()`: supabase-js parses
 * the select in the TYPE system, so interpolating a `string`-typed value
 * collapses the literal type and every caller's row type degrades to
 * `ParserError`.
 *
 * Keep in sync with the SQL allowlist; `reads.anonColumns.test.ts` asserts set
 * equality against the migration, and `anonEntriesGrantContract.test.ts` guards
 * the other direction (no later migration re-granting anon a table-wide SELECT).
 */
const CLASS_COLUMN_SELECT = `id,
      trial_id,
      name,
      description,
      level,
      element,
      section,
      competition_type,
      entry_fee,
      max_entries,
      allow_waitlist,
      max_dogs_per_handler,
      breed_restrictions,
      jump_heights,
      age_min,
      age_max,
      height_min,
      height_max,
      handler_age_min,
      handler_age_max,
      start_time,
      estimated_duration,
      actual_start_time,
      actual_end_time,
      status,
      time_limit_seconds,
      num_areas,
      max_faults,
      qualifying_threshold,
      is_scoring_finalized,
      results_released_at,
      dogs_ahead_notification_count,
      total_entries_count,
      checked_in_count,
      scored_count,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      class_number,
      timer_mode,
      distraction_count,
      is_results_reviewed,
      judge_name,
      time_limit_area2_seconds,
      time_limit_area3_seconds,
      display_order,
      results_released_by,
      version,
      status_source,
      reopened_after_closeout_at,
      revised_expected_start`;

/** The granted columns, for the contract test that pins them against the SQL allowlist. */
export const CLASS_COLUMNS = CLASS_COLUMN_SELECT.split(',').map(column => column.trim());

/** The hide secrets withheld from anon. Exported so the column test can assert absence. */
export const CLASS_HIDE_SECRET_COLUMNS = ['num_hides', 'has_blank', 'hides_known'] as const;

/**
 * What `authenticated` may read (20260731160000, MYK9-127) — the anon allowlist
 * plus `has_blank` and `hides_known`.
 *
 * Only `num_hides` is withheld from signed-in users, and only because a judge-set
 * count is a decisive pre-run advantage. `hides_known` is NOT secret:
 * `sport_class_rules` is anon-readable and publishes the rulebook per
 * element+level, so wherever `hides_known` is true the count is derivable from
 * public data anyway — and competitors legitimately need to know whether a count
 * is disclosed at all.
 *
 * Any `select('*')` on `classes` now fails 42501 for every signed-in user, so
 * this is the replacement at each authenticated call site.
 */
export const CLASS_AUTHENTICATED_COLUMN_SELECT = `${CLASS_COLUMN_SELECT},
      has_blank,
      hides_known`;

/** Pinned by the contract test against the SQL grant. */
export const CLASS_AUTHENTICATED_COLUMNS = CLASS_AUTHENTICATED_COLUMN_SELECT.split(',').map(
  column => column.trim()
);

/**
 * Withheld from `authenticated` as well — officials read it through
 * `get_show_class_hide_counts(show_id)`, never off the class row.
 */
export const CLASS_OFFICIAL_ONLY_COLUMNS = ['num_hides'] as const;

async function postgrestGetAllClasses() {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `
      ${CLASS_COLUMN_SELECT},
      trial:trials (
        id,
        name,
        date,
        trial_number,
        status
      ),
      entries (
        id
      ),
      judge_assignments!judge_assignments_class_id_fkey (
        person_id,
        people!inner (
          first_name,
          last_name
        )
      )
    `
    )
    .is('deleted_at', null)
    .order('start_time', { ascending: true });

  if (error) throw createDatabaseError(error, 'class', 'select_all');
  return { data: data || [], error: null };
}

async function postgrestGetClassById(id: string) {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `
      ${CLASS_COLUMN_SELECT},
      trial:trials (
        id,
        name,
        date,
        trial_number,
        status,
        max_entries_per_dog,
        max_entries_per_handler
      ),
      entries (
        id,
        entry_status,
        points_earned,
        search_time_seconds,
        final_placement,
        dog:dogs (
          id,
          name,
          breed,
          owner:people (
            id,
            first_name,
            last_name
          )
        )
      )
    `
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw createDatabaseError(error, 'class', 'select_by_id');
  return { data, error: null };
}

async function postgrestGetClassesByTrialId(trialId: string) {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `
      ${CLASS_COLUMN_SELECT},
      entries (
        id
      ),
      judge_assignments!judge_assignments_class_id_fkey (
        person_id,
        people!inner (
          first_name,
          last_name
        )
      )
    `
    )
    .eq('trial_id', trialId)
    .is('deleted_at', null)
    .order('start_time', { ascending: true });

  if (error) throw createDatabaseError(error, 'class', 'select_by_trial');
  return { data: data || [], error: null };
}

async function postgrestSearchClasses(searchTerm: string, limit: number) {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `
      ${CLASS_COLUMN_SELECT},
      trial:trials (
        id,
        name,
        date
      )
    `
    )
    .or(
      `name.ilike.%${searchTerm}%,` +
        `level.ilike.%${searchTerm}%,` +
        `description.ilike.%${searchTerm}%`
    )
    .is('deleted_at', null)
    .order('start_time', { ascending: true })
    .limit(limit);

  if (error) throw createDatabaseError(error, 'class', 'search');
  return { data: data || [], error: null };
}

async function postgrestGetClassStatistics() {
  const { error, count } = await supabase
    .from('classes')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  if (error) throw createDatabaseError(error, 'class', 'statistics');
  return { data: { total: count || 0 }, error: null };
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

/**
 * Get all classes with trial relationships and entry counts (excluding soft-deleted)
 */
export const getAllClasses = async () => {
  return readWithReplicationFallback({
    replication: async () => {
      const [classes, trialsMap, entryCountsMap] = await Promise.all([
        replicatedClassesTable.getAll(),
        loadTrialsMap(),
        loadEntryCountsByClassMap(),
      ]);
      // Cold store yields [] without throwing (logged-out guest, never synced),
      // so the fallback catch never fires. Fetch from PostgREST so public pages
      // aren't left class-less. But an empty store can ALSO be legitimate (an
      // authenticated user offline with no classes synced); there PostgREST
      // throws, and we must keep serving the empty list rather than erroring the
      // whole query (useClassesQuery rethrows on a non-null error). So fall back
      // to the empty replication result when PostgREST itself fails.
      if (classes.length === 0) {
        try {
          return await postgrestGetAllClasses();
        } catch {
          return { data: [], error: null };
        }
      }
      const sortedClasses = sortedCopy(
        classes,
        compareStringAscNullsLast(cls => cls.startTime)
      );
      const data = mapClassesWithJoins(sortedClasses, trialsMap, entryCountsMap);
      return { data, error: null };
    },
    postgrest: postgrestGetAllClasses,
    table: 'class',
    operation: 'select_all_with_relations',
    errorData: [],
  });
};

/**
 * Get a class by ID with full details including entries (excluding soft-deleted)
 */
export const getClassById = async (id: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const cls = await replicatedClassesTable.getClassById(id);
      // A cold replication store (logged-out guest never syncs) returns null
      // WITHOUT throwing, so withReplicationFallback's catch never fires and the
      // public class page would read as not-found. Self-fall-through to the
      // anon-safe PostgREST read (classes are a public entity — anon has direct
      // SELECT), mirroring getClassesByTrialId's empty-store branch.
      if (!cls) return await postgrestGetClassById(id);

      const [trial, classEntries, allDogs] = await Promise.all([
        cls.trialId ? replicatedTrialsTable.getTrialById(cls.trialId) : Promise.resolve(null),
        replicatedEntriesTable.getEntriesByClass(id),
        replicatedDogsTable.getAll(),
      ]);

      const dogsMap = buildMapFromArray(allDogs, d => d.id);
      const entries = classEntries.map(entry => {
        const dog = entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null;
        return mapReplicatedEntryToDetailRow(entry, dog);
      });

      const trialObj = trial
        ? {
            id: trial.id,
            name: trial.name,
            date: trial.date,
            ...(trial.trialNumber != null && { trialNumber: trial.trialNumber }),
            ...(trial.status != null && { status: trial.status }),
          }
        : null;

      const data = mapReplicatedClassToDbRow(cls, { trial: trialObj, entries });
      return { data, error: null };
    },
    postgrest: () => postgrestGetClassById(id),
    table: 'class',
    operation: 'select_by_id',
    errorData: null,
  });
};

/**
 * Get classes by trial ID (excluding soft-deleted)
 */
export const getClassesByTrialId = async (trialId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [classes, entryCountsMap] = await Promise.all([
        replicatedClassesTable.getClassesByTrial(trialId),
        loadEntryCountsByClassMap(),
      ]);

      if (classes.length === 0) {
        return await postgrestGetClassesByTrialId(trialId);
      }

      const sortedClasses = sortedCopy(
        classes,
        compareStringAscNullsLast(cls => cls.startTime)
      );
      const data = sortedClasses.map(cls =>
        mapReplicatedClassToDbRow(cls, { entryCount: entryCountsMap.get(cls.id) ?? 0 })
      );
      return { data, error: null };
    },
    postgrest: () => postgrestGetClassesByTrialId(trialId),
    table: 'class',
    operation: 'select_by_trial',
    errorData: [],
  });
};

// ---------------------------------------------------------------------------
// Mutation functions — remain on PostgREST (DO NOT CHANGE)
// ---------------------------------------------------------------------------

// Helper function to log mutations - temporary no-op to pass build
const log = (...args: unknown[]) => {
  void args;
};

/**
 * Create a new class
 */
export const createClass = async (classData: DbClassInsert) => {
  try {
    log('createClass', 'Creating new class', { name: classData.name });

    const { data, error } = await supabase
      .from('classes')
      .insert([
        {
          ...classData,
          created_at: new Date().toISOString(),
        },
      ])
      .select(
        // Not `*`: authenticated has no SELECT on num_hides (20260731160000), and a
        // returning-clause `*` would fail 42501 even though the write itself is allowed.
        `
        ${CLASS_AUTHENTICATED_COLUMN_SELECT},
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `
      )
      .single();

    if (error) {
      log('createClass', 'Error creating class', { error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('createClass', 'Successfully created class', { id: data?.id });
    return { data, error: null };
  } catch (error) {
    log('createClass', 'Unexpected error', { error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Update a class (excluding soft-deleted)
 */
export const updateClass = async (id: string, updates: DbClassUpdate) => {
  try {
    log('updateClass', 'Updating class', { id });

    const { data, error } = await supabase
      .from('classes')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        // Not `*`: authenticated has no SELECT on num_hides (20260731160000), and a
        // returning-clause `*` would fail 42501 even though the write itself is allowed.
        `
        ${CLASS_AUTHENTICATED_COLUMN_SELECT},
        trial:trials (
          id,
          name,
          date,
          trial_number
        )
      `
      )
      .single();

    if (error) {
      log('updateClass', 'Error updating class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('updateClass', 'Successfully updated class', { id });
    return { data, error: null };
  } catch (error) {
    log('updateClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Soft delete a class and cascade-soft-delete all of its entries.
 *
 * Delegates to the `soft_delete_class` SECURITY DEFINER RPC (migration 165),
 * which mirrors `soft_delete_show` (migration 037): the class and its entries
 * go in a single transaction, gated by `can_manage_trial(trial_id)` to match
 * the `classes_delete` RLS policy.
 *
 * The `deletedBy` parameter is preserved for API compatibility but ignored —
 * the RPC reads `auth.uid()` server-side, so callers can no longer attribute
 * the delete to a different user than the authenticated session (which the
 * old app-layer path technically allowed via direct UPDATE).
 */
export const deleteClass = async (id: string, _deletedBy?: string) => {
  try {
    log('deleteClass', 'Soft deleting class via RPC', { id });

    // Cast: generated supabase types don't yet include this RPC; matches the
    // pattern used for `soft_delete_dog` in dogQueries.ts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('soft_delete_class', {
      p_class_id: id,
    });

    if (error) {
      log('deleteClass', 'Error from soft_delete_class RPC', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('deleteClass', 'Successfully soft deleted class and its entries', { id });
    return { data: { id, name: null }, error: null };
  } catch (error) {
    log('deleteClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Search classes by name, level, or description (excluding soft-deleted)
 */
export const searchClasses = async (searchTerm: string, limit = 50) => {
  return readWithReplicationFallback({
    replication: async () => {
      const allClasses = await replicatedClassesTable.getAll();
      const term = searchTerm.toLowerCase();
      const filtered = allClasses.filter(
        cls =>
          cls.name.toLowerCase().includes(term) ||
          (cls.level && cls.level.toLowerCase().includes(term)) ||
          (cls.description && cls.description.toLowerCase().includes(term))
      );
      const sortedClasses = sortedCopy(
        filtered,
        compareStringAscNullsLast(cls => cls.startTime)
      );
      const data = sortedClasses.slice(0, limit).map(cls => mapReplicatedClassToDbRow(cls));
      return { data, error: null };
    },
    postgrest: () => postgrestSearchClasses(searchTerm, limit),
    table: 'class',
    operation: 'search',
    errorData: [],
  });
};

/**
 * Get class statistics (total count, by level, etc.) (excluding soft-deleted)
 */
export const getClassStatistics = async () => {
  return readWithReplicationFallback({
    replication: async () => {
      const allClasses = await replicatedClassesTable.getAll();
      return { data: { total: allClasses.length }, error: null };
    },
    postgrest: postgrestGetClassStatistics,
    table: 'class',
    operation: 'statistics',
    errorData: null,
  });
};

/**
 * Hard delete a class (permanent removal)
 */
export const hardDeleteClass = async (id: string) => {
  try {
    log('hardDeleteClass', 'Permanently deleting class', { id });

    const { data, error } = await supabase.from('classes').delete().eq('id', id);

    if (error) {
      log('hardDeleteClass', 'Error permanently deleting class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('hardDeleteClass', 'Successfully permanently deleted class', { id });
    return { data, error: null };
  } catch (error) {
    log('hardDeleteClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Restore a soft-deleted class
 */
export const restoreClass = async (id: string, restoredBy?: string) => {
  void restoredBy;

  try {
    log('restoreClass', 'Restoring class', { id });

    // classes_select RLS hides soft-deleted rows from every role, so a direct
    // UPDATE matches 0 rows (the SELECT policy gates the UPDATE's row-location
    // step). Restore via an admin-gated SECURITY DEFINER RPC that also
    // cascade-restores the class's entries (migration 20260617120000).
    const { data, error } = await supabase.rpc('restore_class', { p_class_id: id });

    if (error) {
      log('restoreClass', 'Error restoring class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('restoreClass', 'Successfully restored class', { id });
    const restored = Array.isArray(data) ? data[0] : data;
    return { data: restored ?? null, error: null };
  } catch (error) {
    log('restoreClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Get soft-deleted classes (admin only)
 */
export const getDeletedClasses = async () => {
  try {
    log('getDeletedClasses', 'Fetching deleted classes');

    // classes_select RLS hides soft-deleted rows from every role; list via an
    // admin-gated SECURITY DEFINER RPC (migration 20260616140000).
    const { data, error } = await supabase.rpc('get_deleted_classes');

    if (error) {
      log('getDeletedClasses', 'Error fetching deleted classes', { error });
      return { data: [], error: createDatabaseError(error) };
    }

    log('getDeletedClasses', 'Successfully fetched deleted classes', { count: data?.length || 0 });
    return { data: data || [], error: null };
  } catch (error) {
    log('getDeletedClasses', 'Unexpected error', { error });
    return { data: [], error: createDatabaseError(error) };
  }
};
