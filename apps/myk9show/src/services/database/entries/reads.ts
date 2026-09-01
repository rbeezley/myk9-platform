/**
 * Entry lookup queries
 *
 * Read-only operations for fetching and filtering entries.
 * SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
 * Mutation functions live in writes.ts and secretary.ts.
 */
import { supabase, createDatabaseError, logQuery, type DatabaseError } from '../supabaseClient';
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
import { AUTHENTICATED_ENTRY_READ_COLUMNS } from './entrySelects';

// ---------------------------------------------------------------------------
// Helpers — batch-load related data into Maps to avoid N+1 reads
// ---------------------------------------------------------------------------

const ENROLLMENT_FINANCIAL_SELECT = `
        id,
        payment_status
      `;

async function loadDogsMap(): Promise<Map<string, ReplicatedDog>> {
  return loadLookupMap(
    () => replicatedDogsTable.getAllDogs(),
    d => d.id
  );
}

async function loadClassesMap(): Promise<Map<string, ReplicatedClass>> {
  return loadLookupMap(
    () => replicatedClassesTable.getAll(),
    c => c.id
  );
}

async function loadShowsMap(): Promise<Map<string, ReplicatedShow>> {
  return loadLookupMap(
    () => replicatedShowsTable.getAllShows(),
    s => s.id
  );
}

async function loadEnrollmentFinancialsMap(
  entries: ReadonlyArray<ReplicatedEntry>
): Promise<Map<string, Record<string, unknown>>> {
  const enrollmentIds = [
    ...new Set(
      entries.map(entry => entry.registrationId).filter((id): id is string => Boolean(id))
    ),
  ];

  if (enrollmentIds.length === 0) return new Map();

  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select(ENROLLMENT_FINANCIAL_SELECT)
      .in('id', enrollmentIds);

    if (error || !data) return new Map();

    return buildMapFromArray(data as Record<string, unknown>[], enrollment =>
      String(enrollment.id)
    );
  } catch {
    return new Map();
  }
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
  showsMap: Map<string, ReplicatedShow>,
  enrollmentsMap?: Map<string, Record<string, unknown>>
): Record<string, unknown>[] {
  return entries.map(entry => {
    const registration =
      enrollmentsMap && entry.registrationId
        ? (enrollmentsMap.get(entry.registrationId) ?? null)
        : undefined;

    return mapReplicatedEntryToDbRow(entry, {
      dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
      cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
      show: entry.showId ? (showsMap.get(entry.showId) ?? null) : null,
      ...(registration !== undefined ? { registration } : {}),
    });
  });
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
      ),
      registration:registration_id (
        ${ENROLLMENT_FINANCIAL_SELECT}
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
      registration:registration_id (
        ${ENROLLMENT_FINANCIAL_SELECT}
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
      registration:registration_id (
        ${ENROLLMENT_FINANCIAL_SELECT}
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
      registration:registration_id (
        ${ENROLLMENT_FINANCIAL_SELECT}
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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
      ${AUTHENTICATED_ENTRY_READ_COLUMNS},
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

// A replicated entry becomes a tombstone once soft-deleted (e.g. by the
// soft_delete_dog cascade in migration 20260616130000). The replication store
// keeps tombstones around, so replication-backed reads must mirror the postgrest
// `.is('deleted_at', null)` filter — otherwise a deleted dog's entries reappear
// in rosters/scoring after sync. getEntryById is intentionally exempt (its
// postgrest fallback also returns tombstones, for restore/detail lookups).
const isLiveEntry = (entry: ReplicatedEntry): boolean => !entry.deletedAt && !entry.deleted_at;

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
      const sortedEntries = sortedCopy(
        entries.filter(isLiveEntry),
        compareDateDesc(getEntryCreatedSortValue)
      );
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
//
// exhibitor-count-integrity (audit #4): entries replicate per-show, so a show
// the caller hasn't opened this session has an empty local store — and
// readWithReplicationFallback only falls back to `postgrest` on a THROW, not on
// a legitimately-shaped-but-wrong empty array. That produced the audit's
// "0 Entries received" on the styled landing page (which counts `entries.length`
// from this hook) while the exhibitor genuinely had entries. Mirrors the
// empty-local-replica-verifies-online pattern used by getEntriesByDog above and
// getUserEntries in search.ts.
export const getEntriesByShow = async (showId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [entries, dogsMap, classesMap] = await Promise.all([
        replicatedEntriesTable.getEntriesByShow(showId),
        loadDogsMap(),
        loadClassesMap(),
      ]);
      // IDs of this show's locally-tombstoned entries (a queued delete not yet
      // synced), reported to the helper so its `verifyOnlineWhenEmpty` online
      // read excludes them — a stale server row must not resurrect a just-
      // deleted entry. See read-shape.ts.
      const locallyDeletedIds = entries.filter(e => !isLiveEntry(e)).map(e => e.id);
      const sortedEntries = sortedCopy(
        entries.filter(isLiveEntry),
        compareDateDesc(getEntryCreatedSortValue)
      );
      const enrollmentsMap = await loadEnrollmentFinancialsMap(sortedEntries);
      const data = sortedEntries.map(entry =>
        mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
          cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
          registration: entry.registrationId
            ? (enrollmentsMap.get(entry.registrationId) ?? null)
            : null,
        })
      );
      return { data, error: null, locallyDeletedIds };
    },
    postgrest: () => postgrestGetEntriesByShow(showId),
    table: 'entries',
    operation: 'select_by_show',
    errorData: [],
    verifyOnlineWhenEmpty: true,
  });
};

// Get entries by show ID with financial joins (promo_code, trial name)
export const getEntriesByShowForFinancials = async (showId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [rawEntries, dogsMap, classesMap, trials] = await Promise.all([
        replicatedEntriesTable.getEntriesByShow(showId),
        loadDogsMap(),
        loadClassesMap(),
        replicatedTrialsTable.getTrialsByShow(showId),
      ]);
      // Exclude tombstoned entries (mirrors the postgrest deleted_at filter).
      const entries = rawEntries.filter(isLiveEntry);

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
      const enrollmentsMap = await loadEnrollmentFinancialsMap(sortedEntries);
      const data = sortedEntries.map(entry => {
        const raw = entry as unknown as Record<string, unknown>;
        const promoCodeId = raw.promoCodeId as string | undefined;
        const cls = entry.classId ? classesMap.get(entry.classId) : null;
        const trialRow = cls?.trialId ? (trialsMap.get(cls.trialId) ?? null) : null;
        return mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
          cls: cls ?? null,
          registration: entry.registrationId
            ? (enrollmentsMap.get(entry.registrationId) ?? null)
            : null,
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
// MYK9-283: a trial is also wholly inside one per-show replication unit, and the
// check-in sheet is printable at trial scope too, so it carries the same
// cold-store false zero. Verified online when the local read comes back empty.
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
      const inTrial = allEntries.filter(e => e.classId && trialClassIds.has(e.classId));
      const filtered = inTrial.filter(isLiveEntry);
      // Tombstones — a queued delete not yet synced. Required because this read
      // opts into `verifyOnlineWhenEmpty`: a replica holding only a soft-deleted
      // entry filters to empty, which triggers the online read, and without
      // these ids a server row that has not yet seen the delete would resurrect
      // the entry onto a check-in sheet.
      //
      // Deliberately collected from ALL local entries rather than from
      // `inTrial`. Trial membership here is resolved through the local CLASSES
      // replica, which can be cold independently of the entries replica — and a
      // tombstone whose class is missing locally would then be dropped from the
      // exclusion list, which is the one case where it is needed. Widening the
      // list cannot over-exclude: the online read is already scoped to this
      // trial (`class.trial_id = trialId`), so an id from another trial can
      // never appear in the result it filters.
      const locallyDeletedIds = allEntries.filter(e => !isLiveEntry(e)).map(e => e.id);
      const sortedEntries = sortedCopy(filtered, compareDateDesc(getEntryCreatedSortValue));
      const enrollmentsMap = await loadEnrollmentFinancialsMap(sortedEntries);
      const data = sortedEntries.map(entry =>
        mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
          cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
          registration: entry.registrationId
            ? (enrollmentsMap.get(entry.registrationId) ?? null)
            : null,
        })
      );
      return { data, error: null, locallyDeletedIds };
    },
    postgrest: () => postgrestGetEntriesByTrial(trialId),
    table: 'entries',
    operation: 'select_by_trial',
    errorData: [],
    verifyOnlineWhenEmpty: true,
  });
};

// Get entries by class ID (sorted by run_order, nulls last)
// MYK9-283: entries replicate PER SHOW, so a class in a show the caller has not
// opened this session reads EMPTY from the local replica — and
// readWithReplicationFallback only falls back to `postgrest` on a THROW, never
// on a legitimately-shaped-but-cold empty array. The Reports page then reached
// `dataState: 'ready'` with no rows and printed "No entries found for this
// selection" over a class holding 63 entries, on roughly one cold load in six,
// and never retracted it because nothing re-ran when the store later filled.
//
// A class sits ENTIRELY inside one per-show replication unit, so unlike the
// dog scope (see getEntriesByDog below) empty is the only way this read can be
// wrong — which is exactly what `verifyOnlineWhenEmpty` is for. Same treatment
// as getEntriesByShow above.
export const getEntriesByClass = async (classId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const [entries, dogsMap] = await Promise.all([
        replicatedEntriesTable.getEntriesByClass(classId),
        loadDogsMap(),
      ]);
      // Locally-tombstoned entries (a queued delete not yet synced), reported so
      // the online verification excludes them and a stale server row cannot
      // resurrect a just-deleted entry. See read-shape.ts.
      const locallyDeletedIds = entries.filter(e => !isLiveEntry(e)).map(e => e.id);
      const sortedEntries = sortedCopy(
        entries.filter(isLiveEntry),
        compareNumberAscNullsLast(entry => entry.runOrder)
      );
      const enrollmentsMap = await loadEnrollmentFinancialsMap(sortedEntries);
      const data = sortedEntries.map(entry =>
        mapReplicatedEntryToDbRow(entry, {
          dog: entry.dogId ? (dogsMap.get(entry.dogId) ?? null) : null,
          registration: entry.registrationId
            ? (enrollmentsMap.get(entry.registrationId) ?? null)
            : null,
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
      return { data: backfilledData, error: null, locallyDeletedIds };
    },
    postgrest: () => postgrestGetEntriesByClass(classId),
    table: 'entries',
    operation: 'select_by_class',
    errorData: [],
    verifyOnlineWhenEmpty: true,
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

/** A dog-entries read, plus whether it came from an authoritative source. */
export interface DogEntriesReadResult {
  data: unknown[];
  error: DatabaseError | null;
  /**
   * True when these rows came from the ONLINE read, so an empty list means the
   * dog really has no entries. False when the online read was unavailable and
   * the rows came from the local replica, which for this query can only ever be
   * a lower bound (see below) — callers must not present an empty or filtered
   * result as fact.
   */
  verified: boolean;
}

// Read this dog's entries from the local replica, and report the two things the
// server cannot know about:
//   - `locallyDeletedIds` — rows held as soft-delete tombstones, i.e. a queued
//     delete not yet synced, so an online read cannot resurrect them from a
//     server row that predates the delete.
//   - `pendingIds` — rows with unsynced local writes. `ReplicatedEntriesTable`'s
//     own `resolveConflict` keeps a `_syncStatus: 'pending'` row over the server
//     copy for exactly this reason; merging follows that same rule.
async function replicaGetEntriesByDog(dogId: string) {
  const [allEntries, classesMap, showsMap] = await Promise.all([
    replicatedEntriesTable.getAll(),
    loadClassesMap(),
    loadShowsMap(),
  ]);
  const dogEntries = allEntries.filter(e => e.dogId === dogId);
  const locallyDeletedIds = dogEntries.filter(e => !isLiveEntry(e)).map(e => e.id);
  const liveEntries = dogEntries.filter(isLiveEntry);
  const pendingIds = new Set(
    liveEntries.filter(e => e._syncStatus === 'pending').map(e => String(e.id))
  );
  const sortedEntries = sortedCopy(liveEntries, compareDateDesc(getEntryCreatedSortValue));
  const data = sortedEntries.map(entry =>
    mapReplicatedEntryToDbRow(entry, {
      cls: entry.classId ? (classesMap.get(entry.classId) ?? null) : null,
      show: entry.showId ? (showsMap.get(entry.showId) ?? null) : null,
    })
  );
  return { data, locallyDeletedIds, pendingIds };
}

const EMPTY_REPLICA_READ = {
  data: [] as ReturnType<typeof mapReplicatedEntryToDbRow>[],
  locallyDeletedIds: [] as string[],
  pendingIds: new Set<string>(),
};

function rowId(row: unknown): string {
  return String((row as { id?: unknown }).id);
}

// Get entries by dog ID.
//
// ONLINE-FIRST, deliberately not replication-first — the local replica is the
// offline fallback here, not the primary. This is the exception ADR-009 allows
// and the same call `countActiveEntriesByDog` below already made, for the same
// reason.
//
// Entries replicate PER SHOW, so a dog's entries span many replication scopes
// and you cannot know whether a dog is entered in a show that has never synced.
// Local state therefore cannot answer "is this list complete?" even in
// principle — it is only ever a lower bound. The previous design papered over
// that with `verifyOnlineWhenEmpty`, which re-reads online when the local result
// is EMPTY. That leaves a hole no connectivity check can see: a dog with a past
// entry in a synced show and a future entry in an unsynced one returns a
// NON-empty result, so no verification runs, and a caller filtering to
// "upcoming" derives a confident false empty while fully online (MYK9-121).
//
// Reading online first removes the hole rather than detecting it. `verified`
// tells callers which source they got, so an unverifiable result is never
// rendered as fact. Safe for this query specifically: its consumers are
// dog-profile surfaces, not show-day ringside.
export const getEntriesByDog = async (dogId: string): Promise<DogEntriesReadResult> => {
  // Best-effort and deliberately outside the online read's try: the replica
  // supplies pending writes and tombstones, but unavailable local storage must
  // not stop the authoritative read from answering.
  let local = EMPTY_REPLICA_READ;
  try {
    local = await replicaGetEntriesByDog(dogId);
  } catch (error) {
    logQuery('entries', 'select_by_dog_replica_unavailable', 0, String(error));
  }

  try {
    const online = await postgrestGetEntriesByDog(dogId);
    const deleted = new Set(local.locallyDeletedIds);
    const pendingRows = local.data.filter(row => local.pendingIds.has(rowId(row)));
    const pendingById = new Map(pendingRows.map(row => [rowId(row), row]));
    const serverIds = new Set(online.data.map(rowId));

    // The server is authoritative about which rows EXIST, the local replica
    // about rows whose writes it has not accepted yet. So: drop rows deleted
    // locally, prefer the pending local copy of a row the server also has (an
    // unsynced edit must not read as reverted), and append pending rows the
    // server has never seen (an entry created offline must not vanish).
    const data = [
      ...online.data
        .filter(row => !deleted.has(rowId(row)))
        .map(row => {
          const pending = pendingById.get(rowId(row));
          if (!pending) return row;
          // Overlay the pending FIELDS rather than swapping the whole row. The
          // replica maps `class`/`show` from local lookup caches that may be
          // cold (a row hydrated on its own has neither), while the server row
          // always carries its joins. `deriveDogActivity` classifies on
          // `show.start_date`, so dropping the join would push the entry out of
          // "upcoming" — a false empty produced by the very read meant to
          // prevent one.
          const serverRow = row as Record<string, unknown>;
          const localRow = pending as Record<string, unknown>;
          return {
            ...serverRow,
            ...localRow,
            class: localRow.class ?? serverRow.class,
            show: localRow.show ?? serverRow.show,
          };
        }),
      ...pendingRows.filter(row => !serverIds.has(rowId(row))),
    ];
    return { data, error: null, verified: true };
  } catch (error) {
    // Offline, or the read failed. Serve the replica — correct as far as it
    // goes, but unverifiable, hence `verified: false`.
    logQuery('entries', 'select_by_dog_replica_fallback', 0, String(error));
    return { data: local.data, error: null, verified: false };
  }
};

// Count a dog's live (non-soft-deleted) entries.
//
// Deliberately a DIRECT PostgREST head-count, NOT the replication layer:
// entries replicate per-show, so a user who hasn't entered an /at-show session
// has an empty local store and getEntriesByDog would return 0 — a false count.
// This drives the delete-dog confirmation warning, which must be accurate
// regardless of sync state. It is an authed action (not a public route) and not
// offline-critical, so a direct read is appropriate.
export const countActiveEntriesByDog = async (dogId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('dog_id', dogId)
    .is('deleted_at', null);
  if (error) throw error;
  return count ?? 0;
};

// Count a dog's live entries that BLOCK a delete — the exact predicate
// soft_delete_dog refuses on (MK002, migration 20260830140000). Kept in step
// with it by `entryBlocksDogDelete.contract.test.ts`, which reads both.
//
// 'refunded' and 'waived' do not block: no money is being kept. A direct
// head-count for the same reason as countActiveEntriesByDog above — a
// per-show-replicated local store cannot answer this honestly.
export const countBlockingEntriesByDog = async (dogId: string): Promise<number> => {
  const { count, error } = await supabase
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('dog_id', dogId)
    .is('deleted_at', null)
    .or(
      'payment_status.eq.paid,is_scored.is.true,scoring_completed_at.not.is.null,and(result_status.not.is.null,result_status.neq.pending)'
    );
  if (error) throw error;
  return count ?? 0;
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
      const filtered = allEntries.filter(e => e.entryStatus === status && isLiveEntry(e));
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
