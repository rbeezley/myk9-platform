/**
 * Entry lookup queries
 *
 * Read-only operations for fetching and filtering entries.
 * SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
 * Mutation functions live in writes.ts and secretary.ts.
 */
import { supabase, createDatabaseError, type DatabaseError } from '../supabaseClient';
import {
  compareDateDesc,
  compareNumberAscNullsLast,
  loadLookupMap,
  readWithReplicationFallback,
  sortedCopy,
} from '../_shared/read-shape';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';
import { mapReplicatedEntryToDbRow } from '@/services/mappers/entryMappers';
import { buildMapFromArray } from '../_shared/maps';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { EntryStatus } from '@/types/entry-lifecycle';
import type { DbEntryWithRelations } from '@/services/mappers/classMappers';

// ---------------------------------------------------------------------------
// Helpers — batch-load related data into Maps to avoid N+1 reads
// ---------------------------------------------------------------------------

async function loadDogsMap(): Promise<Map<string, ReplicatedDog>> {
  return loadLookupMap(() => replicatedDogsTable.getAllDogs(), d => d.id);
}

async function loadClassesMap(): Promise<Map<string, ReplicatedClass>> {
  return loadLookupMap(() => replicatedClassesTable.getAll(), c => c.id);
}

async function loadShowsMap(): Promise<Map<string, ReplicatedShow>> {
  return loadLookupMap(() => replicatedShowsTable.getAllShows(), s => s.id);
}

function getEntryCreatedSortValue(entry: ReplicatedEntry): string | undefined {
  // Replication stores submitted_at as submittedAt; the mapper emits it as
  // created_at for the DB-shaped row, matching the PostgREST order column.
  return entry.submittedAt ?? entry.updated_at;
}

/**
 * Map an array of ReplicatedEntry to DB-row-shaped objects using pre-loaded
 * lookup maps. Joins dog, class, and show sub-objects.
 */
function mapEntriesWithStandardJoins(
  entries: ReplicatedEntry[],
  dogsMap: Map<string, ReplicatedDog>,
  classesMap: Map<string, ReplicatedClass>,
  showsMap: Map<string, ReplicatedShow>
): Record<string, unknown>[] {
  return entries.map(entry =>
    mapReplicatedEntryToDbRow(entry, {
      dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
      cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
      show: entry.showId ? (showsMap.get(entry.showId) ?? null) : null,
    })
  );
}

// ---------------------------------------------------------------------------
// Internal helper — keep on PostgREST (Task 6 will migrate later)
// ---------------------------------------------------------------------------

/**
 * Fetch armband numbers from the authoritative `armbands` table for entries
 * that are missing them. Returns a Map of `show_id:dog_id` → armband_number.
 *
 * The `entries.armband` column is a denormalized copy that may lag behind
 * if the replication UPDATE mutation hasn't synced yet. The `armbands` table
 * is the authoritative source (written atomically by the assign_armband RPC).
 *
 * Reads from replicatedArmbandsTable first, falls back to PostgREST.
 */
async function fetchMissingArmbands(
  entries: ReadonlyArray<{ armband: string | null; show_id: string | null; dog_id: string | null }>
): Promise<Map<string, string>> {
  const missing = entries.filter(e => !e.armband && e.show_id && e.dog_id);
  if (missing.length === 0) return new Map();

  const showIds = [...new Set(missing.map(e => e.show_id!))];
  const dogIds = new Set(missing.map(e => e.dog_id!));

  try {
    // Read from replication store
    const armbandsByShow = await Promise.all(
      showIds.map(sid => replicatedArmbandsTable.getByShow(sid))
    );
    const allArmbands = armbandsByShow.flat();

    // Filter to only the dog IDs we need
    const relevant = allArmbands.filter(a => a.dogId && dogIds.has(a.dogId));
    if (relevant.length === 0) return new Map();

    return new Map(relevant.map(a => [`${a.showId}:${a.dogId}`, a.armbandNumber]));
  } catch {
    // Fallback to PostgREST
    const { data: armbandRows } = await supabase
      .from('armbands')
      .select('show_id, dog_id, armband_number')
      .in('show_id', showIds)
      .in('dog_id', [...dogIds]);

    if (!armbandRows || armbandRows.length === 0) return new Map();

    return new Map(armbandRows.map(a => [`${a.show_id}:${a.dog_id}`, String(a.armband_number)]));
  }
}

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

async function postgrestGetAllEntries() {
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
        registrations:dog_registrations (
          organization,
          breed
        ),
        owner:owner_id (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      ),
      class:class_id (
        id,
        name,
        class_number,
        entry_fee,
        max_entries
      ),
      show:show_id (
        id,
        name,
        start_date,
        end_date,
        location,
        status
      )
    `
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_all');
  return { data: data || [], error: null };
}

async function postgrestGetEntryById(id: string) {
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
        registration_number,
        owner:owner_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address,
          city,
          state,
          postal_code
        )
      ),
      class:class_id (
        id,
        name,
        class_number,
        description,
        entry_fee,
        max_entries,
        jump_height
      ),
      show:show_id (
        id,
        name,
        start_date,
        end_date,
        location,
        status
      )
    `
    )
    .eq('id', id)
    .single();

  if (error) throw createDatabaseError(error, 'entries', 'select_by_id');
  return { data, error: null };
}

async function postgrestGetEntriesByShow(showId: string) {
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
        registrations:dog_registrations (
          organization,
          breed
        ),
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
      )
    `
    )
    .eq('show_id', showId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_by_show');
  return { data: data || [], error: null };
}

async function postgrestGetEntriesByShowForFinancials(showId: string) {
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
      promo_code:promo_code_id (
        id,
        code,
        discount_type,
        discount_value
      ),
      trial:trial_id (
        id,
        name
      )
    `
    )
    .eq('show_id', showId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_by_show_financials');
  return { data: data || [], error: null };
}

async function postgrestGetEntriesByTrial(trialId: string) {
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
      class:class_id!inner (
        id,
        name,
        class_number,
        entry_fee,
        trial_id
      ),
      promo_code:promo_code_id (
        id,
        code,
        discount_type,
        discount_value
      )
    `
    )
    .eq('class.trial_id', trialId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_by_trial');
  return { data: data || [], error: null };
}

async function postgrestGetEntriesByClass(classId: string) {
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
      )
    `
    )
    .eq('class_id', classId)
    .is('deleted_at', null)
    .order('run_order', { ascending: true, nullsFirst: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_by_class');

  const entries = data || [];

  // Backfill armbands from the authoritative armbands table
  const armbandMap = await fetchMissingArmbands(entries);
  const backfilledEntries = entries.map(e => {
    if (!e.armband && e.show_id && e.dog_id) {
      const armband = armbandMap.get(`${e.show_id}:${e.dog_id}`);
      if (armband) return { ...e, armband };
    }
    return e;
  });

  return { data: backfilledEntries, error: null };
}

async function postgrestGetEntriesByDog(dogId: string) {
  const { data, error } = await supabase
    .from('entries')
    .select(
      `
      *,
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
        end_date,
        location
      )
    `
    )
    .eq('dog_id', dogId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_by_dog');
  return { data: data || [], error: null };
}

async function postgrestGetEntriesByStatus(status: EntryStatus) {
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
    .eq('entry_status', status)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw createDatabaseError(error, 'entries', 'select_by_status');
  return { data: data || [], error: null };
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

// Get all entries with related data
export const getAllEntries = async () => {
  return readWithReplicationFallback({
    replication: async () => {
      const [entries, dogsMap, classesMap, showsMap] = await Promise.all([
        replicatedEntriesTable.getAll(),
        loadDogsMap(),
        loadClassesMap(),
        loadShowsMap(),
      ]);
      const sortedEntries = sortedCopy(entries, compareDateDesc(getEntryCreatedSortValue));
      const data = mapEntriesWithStandardJoins(sortedEntries, dogsMap, classesMap, showsMap);
      return { data, error: null };
    },
    postgrest: postgrestGetAllEntries,
    table: 'entries',
    operation: 'select_all_with_details',
    errorData: [],
  });
};

// Get entry by ID with full details
export const getEntryById = async (id: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const entry = await replicatedEntriesTable.getEntryById(id);
      if (!entry) return { data: null, error: null };
      const [dog, cls, show] = await Promise.all([
        entry.dogId ? replicatedDogsTable.getDogById(entry.dogId) : Promise.resolve(null),
        entry.classId ? replicatedClassesTable.getClassById(entry.classId) : Promise.resolve(null),
        entry.showId ? replicatedShowsTable.getShowById(entry.showId) : Promise.resolve(null),
      ]);
      const data = mapReplicatedEntryToDbRow(entry, { dog, cls, show });
      return { data, error: null };
    },
    postgrest: () => postgrestGetEntryById(id),
    table: 'entries',
    operation: 'select_by_id_detailed',
    errorData: null,
  });
};

// Get entries by show ID
export const getEntriesByShow = async (showId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [entries, dogsMap, classesMap] = await Promise.all([
        replicatedEntriesTable.getEntriesByShow(showId),
        loadDogsMap(),
        loadClassesMap(),
      ]);
      const sortedEntries = sortedCopy(entries, compareDateDesc(getEntryCreatedSortValue));
      const data = sortedEntries.map(entry =>
        mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
          cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
        })
      );
      return { data, error: null };
    },
    postgrest: () => postgrestGetEntriesByShow(showId),
    table: 'entries',
    operation: 'select_by_show',
    errorData: [],
  });
};

// Get entries by show ID with financial joins (promo_code, trial name)
export const getEntriesByShowForFinancials = async (showId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [entries, dogsMap, classesMap, trials] = await Promise.all([
        replicatedEntriesTable.getEntriesByShow(showId),
        loadDogsMap(),
        loadClassesMap(),
        replicatedTrialsTable.getTrialsByShow(showId),
      ]);

      // Build trial lookup map
      const trialsMap = new Map(trials.map(t => [t.id, { id: t.id, name: t.name }]));

      // Collect unique promo_code_ids for batch PostgREST fetch
      // promoCodeId is not in the ReplicatedEntry type but may exist on the raw object
      const promoCodeIds = [
        ...new Set(
          entries
            .map(e => (e as unknown as Record<string, unknown>).promoCodeId as string | undefined)
            .filter((id): id is string => !!id)
        ),
      ];

      // Batch-fetch promo codes from PostgREST (not replicated)
      let promoCodesMap = new Map<string, Record<string, unknown>>();
      if (promoCodeIds.length > 0) {
        const { data: promoCodes } = await supabase
          .from('promo_codes')
          .select('id, code, discount_type, discount_value')
          .in('id', promoCodeIds);
        if (promoCodes) {
          promoCodesMap = buildMapFromArray(promoCodes, pc => pc.id);
        }
      }

      const sortedEntries = sortedCopy(entries, compareDateDesc(getEntryCreatedSortValue));
      const data = sortedEntries.map(entry => {
        const raw = entry as unknown as Record<string, unknown>;
        const promoCodeId = raw.promoCodeId as string | undefined;
        const cls = entry.classId ? classesMap.get(entry.classId) : null;
        const trialRow = cls?.trialId ? (trialsMap.get(cls.trialId) ?? null) : null;
        return mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
          cls: cls ?? null,
          promoCode: promoCodeId ? (promoCodesMap.get(promoCodeId) ?? null) : null,
          trial: trialRow,
        });
      });

      return { data, error: null };
    },
    postgrest: () => postgrestGetEntriesByShowForFinancials(showId),
    table: 'entries',
    operation: 'select_by_show_financials',
    errorData: [],
  });
};

// Get entries by trial ID (via class join — inner join behavior)
export const getEntriesByTrial = async (trialId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      // Get classes for this trial, then filter entries by those class IDs
      const [trialClasses, allEntries, dogsMap] = await Promise.all([
        replicatedClassesTable.getClassesByTrial(trialId),
        replicatedEntriesTable.getAll(),
        loadDogsMap(),
      ]);
      const trialClassIds = new Set(trialClasses.map(c => c.id));
      const classesMap = buildMapFromArray(trialClasses, c => c.id);
      // Filter entries to only those whose classId is in the trial's classes (inner join)
      const filtered = allEntries.filter(e => e.classId && trialClassIds.has(e.classId));
      const sortedEntries = sortedCopy(filtered, compareDateDesc(getEntryCreatedSortValue));
      const data = sortedEntries.map(entry =>
        mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
          cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
        })
      );
      return { data, error: null };
    },
    postgrest: () => postgrestGetEntriesByTrial(trialId),
    table: 'entries',
    operation: 'select_by_trial',
    errorData: [],
  });
};

// Get entries by class ID (sorted by run_order, nulls last)
export const getEntriesByClass = async (classId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [entries, dogsMap] = await Promise.all([
        replicatedEntriesTable.getEntriesByClass(classId),
        loadDogsMap(),
      ]);
      const sortedEntries = sortedCopy(entries, compareNumberAscNullsLast(entry => entry.runOrder));
      const data = sortedEntries.map(entry =>
        mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
        })
      );
      // Backfill armbands from the authoritative armbands table for entries
      // whose replication UPDATE hasn't synced yet
      const armbandMap = await fetchMissingArmbands(
        data.map(d => ({
          armband: d.armband as string | null,
          show_id: d.show_id as string | null,
          dog_id: d.dog_id as string | null,
        }))
      );
      const backfilledData = data.map(e => {
        if (!e.armband && e.show_id && e.dog_id) {
          const armband = armbandMap.get(`${e.show_id}:${e.dog_id}`);
          if (armband) return { ...e, armband };
        }
        return e;
      });
      return { data: backfilledData, error: null };
    },
    postgrest: () => postgrestGetEntriesByClass(classId),
    table: 'entries',
    operation: 'select_by_class',
    errorData: [],
  });
};

// Compatibility name used by class-oriented callers. Keep the implementation
// here so Entry reads remain behind the Entry module interface.
export const getEntriesByClassId = async (
  classId: string
): Promise<{ data: DbEntryWithRelations[]; error: DatabaseError | null }> => {
  const result = await getEntriesByClass(classId);
  return {
    data: result.data as unknown as DbEntryWithRelations[],
    error: result.error,
  };
};

// Get entries by dog ID
export const getEntriesByDog = async (dogId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [allEntries, classesMap, showsMap] = await Promise.all([
        replicatedEntriesTable.getAll(),
        loadClassesMap(),
        loadShowsMap(),
      ]);
      const filtered = allEntries.filter(e => e.dogId === dogId);
      const sortedEntries = sortedCopy(filtered, compareDateDesc(getEntryCreatedSortValue));
      const data = sortedEntries.map(entry =>
        mapReplicatedEntryToDbRow(entry, {
          cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
          show: entry.showId ? (showsMap.get(entry.showId) ?? null) : null,
        })
      );
      return { data, error: null };
    },
    postgrest: () => postgrestGetEntriesByDog(dogId),
    table: 'entries',
    operation: 'select_by_dog',
    errorData: [],
  });
};

// Get entries by status
export const getEntriesByStatus = async (status: EntryStatus) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [allEntries, dogsMap, classesMap, showsMap] = await Promise.all([
        replicatedEntriesTable.getAll(),
        loadDogsMap(),
        loadClassesMap(),
        loadShowsMap(),
      ]);
      const filtered = allEntries.filter(e => e.entryStatus === status);
      const sortedEntries = sortedCopy(filtered, compareDateDesc(getEntryCreatedSortValue));
      const data = mapEntriesWithStandardJoins(sortedEntries, dogsMap, classesMap, showsMap);
      return { data, error: null };
    },
    postgrest: () => postgrestGetEntriesByStatus(status),
    table: 'entries',
    operation: 'select_by_status',
    errorData: [],
  });
};
