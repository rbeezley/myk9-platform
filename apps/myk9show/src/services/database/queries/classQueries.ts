// Class Database Query Layer - Phase 2.5: Class Store Integration
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.

import { supabase, createDatabaseError, type DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from './replicationUtils';
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
import { buildMapFromArray } from './queryUtils';

// Re-export entry operations from sibling module for backward compatibility
export {
  getAllEntries,
  getEntriesByClassId,
  createEntry,
  updateEntry,
  deleteEntry,
  hardDeleteEntry,
  restoreEntry,
  getDeletedEntries,
} from './classQueries.entries';

// ---------------------------------------------------------------------------
// Helpers — batch-load related data into Maps to avoid N+1 reads
// ---------------------------------------------------------------------------

async function loadTrialsMap(): Promise<Map<string, ReplicatedTrial>> {
  const trials = await replicatedTrialsTable.getAll();
  return buildMapFromArray(trials, t => t.id);
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

async function postgrestGetAllClasses() {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `
      *,
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
      *,
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
    .single();

  if (error) throw createDatabaseError(error, 'class', 'select_by_id');
  return { data, error: null };
}

async function postgrestGetClassesByTrialId(trialId: string) {
  const { data, error } = await supabase
    .from('classes')
    .select(
      `
      *,
      entries (
        id
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
      *,
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
  try {
    return await withReplicationFallback(
      async () => {
        const [classes, trialsMap, entryCountsMap] = await Promise.all([
          replicatedClassesTable.getAll(),
          loadTrialsMap(),
          loadEntryCountsByClassMap(),
        ]);
        const data = mapClassesWithJoins(classes, trialsMap, entryCountsMap);
        return { data, error: null };
      },
      postgrestGetAllClasses,
      'class',
      'select_all_with_relations'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

/**
 * Get a class by ID with full details including entries (excluding soft-deleted)
 */
export const getClassById = async (id: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const cls = await replicatedClassesTable.getClassById(id);
        if (!cls) return { data: null, error: null };

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
      () => postgrestGetClassById(id),
      'class',
      'select_by_id'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
};

/**
 * Get classes by trial ID (excluding soft-deleted)
 */
export const getClassesByTrialId = async (trialId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const [classes, entryCountsMap] = await Promise.all([
          replicatedClassesTable.getClassesByTrial(trialId),
          loadEntryCountsByClassMap(),
        ]);
        const data = classes.map(cls =>
          mapReplicatedClassToDbRow(cls, { entryCount: entryCountsMap.get(cls.id) ?? 0 })
        );
        return { data, error: null };
      },
      () => postgrestGetClassesByTrialId(trialId),
      'class',
      'select_by_trial'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
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
        `
        *,
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
        `
        *,
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
 * Mirrors the cascade behavior of `soft_delete_show` (migration 037): a class
 * with active entries cannot be left orphaned in the data model, since
 * exhibitor-facing views would otherwise still surface those entries against a
 * "deleted" class. Cascading at the application layer keeps the writes simple
 * and avoids requiring a new RPC just for the secretary's class-delete path.
 */
export const deleteClass = async (id: string, deletedBy?: string) => {
  try {
    log('deleteClass', 'Soft deleting class', { id });

    const now = new Date().toISOString();
    const softDeleteUpdate: Record<string, unknown> = {
      deleted_at: now,
      updated_at: now,
      ...(deletedBy ? { deleted_by: deletedBy } : {}),
    };

    // Soft-delete entries first so the cascade is visible even if the class
    // update is rejected by RLS — better to over-delete entries than leave
    // them pointing at a missing class.
    const { error: entriesError } = await supabase
      .from('entries')
      .update(softDeleteUpdate)
      .eq('class_id', id)
      .is('deleted_at', null);

    if (entriesError) {
      log('deleteClass', 'Error soft deleting entries for class', { id, entriesError });
      return { data: null, error: createDatabaseError(entriesError) };
    }

    const { data, error } = await supabase
      .from('classes')
      .update(softDeleteUpdate)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, name')
      .single();

    if (error) {
      log('deleteClass', 'Error soft deleting class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('deleteClass', 'Successfully soft deleted class and its entries', { id });
    return { data, error: null };
  } catch (error) {
    log('deleteClass', 'Unexpected error', { id, error });
    return { data: null, error: createDatabaseError(error) };
  }
};

/**
 * Search classes by name, level, or description (excluding soft-deleted)
 */
export const searchClasses = async (searchTerm: string, limit = 50) => {
  try {
    return await withReplicationFallback(
      async () => {
        const allClasses = await replicatedClassesTable.getAll();
        const term = searchTerm.toLowerCase();
        const filtered = allClasses
          .filter(
            cls =>
              cls.name.toLowerCase().includes(term) ||
              (cls.level && cls.level.toLowerCase().includes(term)) ||
              (cls.description && cls.description.toLowerCase().includes(term))
          )
          .slice(0, limit);
        const data = filtered.map(cls => mapReplicatedClassToDbRow(cls));
        return { data, error: null };
      },
      () => postgrestSearchClasses(searchTerm, limit),
      'class',
      'search'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

/**
 * Get class statistics (total count, by level, etc.) (excluding soft-deleted)
 */
export const getClassStatistics = async () => {
  try {
    return await withReplicationFallback(
      async () => {
        const allClasses = await replicatedClassesTable.getAll();
        return { data: { total: allClasses.length }, error: null };
      },
      postgrestGetClassStatistics,
      'class',
      'statistics'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
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
  try {
    log('restoreClass', 'Restoring class', { id });

    const { data, error } = await supabase
      .from('classes')
      .update({
        deleted_at: null,
        deleted_by: null,
        updated_at: new Date().toISOString(),
        updated_by: restoredBy || null,
      })
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .select(
        `
        *,
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
      log('restoreClass', 'Error restoring class', { id, error });
      return { data: null, error: createDatabaseError(error) };
    }

    log('restoreClass', 'Successfully restored class', { id });
    return { data, error: null };
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

    const { data, error } = await supabase
      .from('classes')
      .select(
        `
        *,
        trial:trials (
          id,
          name,
          date,
          trial_number
        ),
        deleted_by_user:deleted_by (
          id,
          first_name,
          last_name,
          email
        )
      `
      )
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

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
