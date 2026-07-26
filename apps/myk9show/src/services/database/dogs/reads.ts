// Dog-related database queries
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.
import { supabase, logQuery, createDatabaseError, type DatabaseError } from '../supabaseClient';
import { compareStringAsc, readWithReplicationFallback, sortedCopy } from '../_shared/read-shape';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { logger } from '@/services/LoggingService';
import type { DbDogInsert, DbDogUpdate } from '../../../types/database-mappings';
import type { TablesUpdate } from '@/types/supabase';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { mapReplicatedDogToDbRow } from '@/services/mappers/dogMappers';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import { selectOwnedDogs } from '@/utils/dogOwnership';
import {
  normalizeDogRegistrationNumber,
  normalizeDogRegistrationOrganization,
} from '@/utils/dogIdentity';

// PostgREST OR filter for dogs owned or co-owned by a person
const ownedByPerson = (personId: string) => `owner_id.eq.${personId},co_owner_id.eq.${personId}`;

/**
 * Filter replicated dogs by ownership (owner or co-owner).
 * Note: ReplicatedDog only has `ownerId` — co_owner_id is not replicated.
 * Co-owned dogs that are not primary-owned will be caught by the PostgREST fallback.
 */
function filterByOwnership(dogs: ReplicatedDog[], personId: string): ReplicatedDog[] {
  return selectOwnedDogs(dogs, personId);
}

// ---------------------------------------------------------------------------
// Helpers — batch-load owner data from PostgREST (people is NOT replicated)
// ---------------------------------------------------------------------------

interface OwnerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

async function loadOwnersMap(ownerIds: string[]): Promise<Map<string, OwnerRow>> {
  if (ownerIds.length === 0) return new Map();
  const uniqueIds = [...new Set(ownerIds)];
  const { data } = await supabase
    .from('people')
    .select('id, first_name, last_name, email, phone')
    .in('id', uniqueIds);
  const map = new Map<string, OwnerRow>();
  if (data) {
    for (const row of data) {
      map.set(row.id, row as OwnerRow);
    }
  }
  return map;
}

function appendRegistrations(
  map: Map<string, Record<string, unknown>[]>,
  rows: Record<string, unknown>[] | null | undefined
): void {
  if (!rows) return;

  for (const row of rows) {
    const dogId = row.dog_id as string | undefined;
    if (!dogId) continue;
    const existing = map.get(dogId) ?? [];
    const rowOrganization = normalizeDogRegistrationOrganization(row.organization as string | null);
    const rowNumber = normalizeDogRegistrationNumber(row.registration_number as string | null);
    const hasSameId = existing.some(registration => registration.id === row.id);
    const hasSameRegistryIdentity =
      rowOrganization !== '' &&
      rowNumber !== '' &&
      existing.some(
        registration =>
          normalizeDogRegistrationOrganization(registration.organization as string | null) ===
            rowOrganization &&
          normalizeDogRegistrationNumber(registration.registration_number as string | null) ===
            rowNumber
      );
    if (!hasSameId && !hasSameRegistryIdentity) {
      existing.push(row);
    }
    map.set(dogId, existing);
  }
}

/**
 * Copy the local replica's ordered `created_at` onto the matching server row.
 *
 * `create_dog_with_registrations` inserts every registration in one transaction
 * without `created_at`, so PostgreSQL stamps them all identically and the
 * identity resolver's comparator ties — falling through to a random server
 * UUID. The local mirror holds the real creation ORDER, so once a server row is
 * recognised as the same registration (same organization + number), the local
 * timestamp is the better answer.
 *
 * This restores creation order on the device that created the dog. It does NOT
 * fix another device, which has no local mirror — that needs the RPC function
 * itself to insert `created_at`, which is a migration and out of scope here.
 */
function overlayLocalCreationOrder(
  map: Map<string, Record<string, unknown>[]>,
  localRegistrations: Record<string, unknown>[]
): void {
  for (const local of localRegistrations) {
    const dogId = local.dog_id as string | undefined;
    const localCreatedAt = local.created_at as string | undefined;
    if (!dogId || !localCreatedAt) continue;
    const organization = normalizeDogRegistrationOrganization(local.organization as string | null);
    const number = normalizeDogRegistrationNumber(local.registration_number as string | null);
    if (organization === '' || number === '') continue;

    const rows = map.get(dogId);
    if (!rows) continue;
    // Replace with a shallow COPY rather than mutating: these objects come
    // straight off the PostgREST response, and mutating a caller's input is how
    // one read silently changes what another sees.
    map.set(
      dogId,
      rows.map(row => {
        if (row === local) return row;
        if (
          normalizeDogRegistrationOrganization(row.organization as string | null) ===
            organization &&
          normalizeDogRegistrationNumber(row.registration_number as string | null) === number
        ) {
          return { ...row, created_at: localCreatedAt };
        }
        return row;
      })
    );
  }
}

/**
 * Registrations merged from the server and the offline replica, plus whether
 * the server leg failed.
 *
 * The flag matters because `ReplicatedDogRegistrationsTable.sync()` is a no-op:
 * the replica only ever holds registrations CREATED locally, so for a dog whose
 * registrations came from PostgREST the local leg returns nothing. An empty
 * result is therefore ambiguous — "this dog has no registrations" and "we could
 * not read them" look identical — and callers that print paperwork must be able
 * to tell those apart rather than rendering a blank (MYK9-90 review round 3).
 */
export interface DogRegistrationsResult {
  byDog: Map<string, Record<string, unknown>[]>;
  serverError: unknown | null;
  registrationsReadComplete: boolean;
}

// Registrations can exist as pending local rows before PostGREST can see them.
// Merge the local replica with server rows so offline-created dogs keep their
// registration data after refresh and while the queue is waiting to upload.
export async function loadDogRegistrations(dogIds: string[]): Promise<DogRegistrationsResult> {
  if (dogIds.length === 0) {
    return { byDog: new Map(), serverError: null, registrationsReadComplete: true };
  }
  const map = new Map<string, Record<string, unknown>[]>();
  const [localResult, serverResult] = await Promise.all([
    (async (): Promise<{ data: Record<string, unknown>[]; error: unknown | null }> => {
      try {
        return {
          data: await replicatedDogRegistrationsTable.getRegistrationsForDogs(dogIds),
          error: null,
        };
      } catch (error) {
        return { data: [], error };
      }
    })(),
    // A thrown network error must surface as `serverError`, not reject the whole
    // read — the replica may still be able to answer.
    (async (): Promise<{ data: unknown; error: unknown }> => {
      try {
        return await supabase.from('dog_registrations').select('*').in('dog_id', dogIds);
      } catch (error) {
        return { data: null, error };
      }
    })(),
  ]);

  appendRegistrations(map, serverResult.data as Record<string, unknown>[] | null | undefined);
  appendRegistrations(map, localResult.data);
  overlayLocalCreationOrder(map, localResult.data);
  return {
    byDog: map,
    serverError: serverResult.error ?? null,
    // Completeness describes the authoritative server leg. A local replica
    // failure may hide a pending local-only row, but it must not make valid
    // server registrations look unusable to callers that already have them.
    registrationsReadComplete: !serverResult.error,
  };
}

/**
 * Map an array of ReplicatedDog to DB-row-shaped objects, attaching owner
 * and registration sub-objects from pre-loaded maps.
 */
function mapDogsWithOwners(
  dogs: ReplicatedDog[],
  ownersMap: Map<string, OwnerRow>,
  registrationsMap: Map<string, Record<string, unknown>[]>,
  registrationsReadComplete: boolean
): Record<string, unknown>[] {
  return dogs.map(dog => {
    const owner = dog.ownerId ? (ownersMap.get(dog.ownerId) ?? null) : null;
    const registrations = registrationsMap.get(dog.id) ?? [];
    return mapReplicatedDogToDbRow(dog, {
      owner: owner as Record<string, unknown> | null,
      registrations,
      registrationsReadComplete,
    });
  });
}

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

async function postgrestGetAllDogs(personId: string, showAll = false) {
  let query = supabase
    .from('dogs')
    .select(
      `
      *,
      owner:people!dogs_owner_id_fkey(
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      registrations:dog_registrations(*)
    `
    )
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (!showAll) {
    query = query.or(ownedByPerson(personId));
  }

  const { data, error } = await query;
  if (error) throw createDatabaseError(error, 'dog', 'select_all');
  return { data: data || [], error: null };
}

async function postgrestGetDogById(id: string) {
  const { data, error } = await supabase
    .from('dogs')
    .select(
      `
      *,
      owner:people!dogs_owner_id_fkey(
        id,
        first_name,
        last_name,
        email,
        phone,
        street_address,
        city,
        state,
        zip_code
      ),
      registrations:dog_registrations(*),
      health_records(*),
      entries(
        *,
        class:classes(
          id,
          name,
          class_number
        ),
        show:shows(
          id,
          name,
          start_date,
          end_date
        )
      )
    `
    )
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error) throw createDatabaseError(error, 'dog', 'select_by_id');
  return { data, error: null };
}

async function postgrestGetDogsByOwner(ownerId: string) {
  const { data, error } = await supabase
    .from('dogs')
    // `My Dogs` is a generic surface, so `mapDatabaseToDog` resolves the PRIMARY
    // registration. That needs the resolver's ordering/tiebreak fields
    // (`created_at`, `id`) and the identity fields themselves — the old embed
    // picked whichever registration PostgREST happened to return first, with no
    // organization scoping at all. `is_primary` is deliberately not selected
    // while its migration is unpushed; `created_at` then `id` is deterministic
    // on its own and agrees with what the backfill will mark.
    .select(
      '*, registrations:dog_registrations(id,created_at,breed,variety,registered_name,registration_number,organization,status)'
    )
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) throw createDatabaseError(error, 'dog', 'select_by_owner');
  return { data: data || [], error: null };
}

/**
 * Resolve `dog_id`s whose REGISTRATION matches the term on breed. Breed lives on
 * `dog_registrations`, not on `dogs`, so a breed search is a two-step: PostgREST
 * cannot OR a parent-column filter against an embedded-table filter in one
 * request. The error is thrown rather than swallowed — silently downgrading a
 * backend failure to "no breed matches" makes it indistinguishable from "no such
 * dog".
 */
async function dogIdsMatchingRegistrationBreed(sanitized: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('dog_registrations')
    .select('dog_id')
    .ilike('breed', `%${sanitized}%`);
  if (error) throw createDatabaseError(error, 'dog', 'search_registration_breed');
  return [
    ...new Set(
      ((data ?? []) as Array<{ dog_id?: string | null }>)
        .map(r => r.dog_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
}

async function postgrestSearchDogs(searchTerm: string, personId: string) {
  const sanitized = sanitizePostgRESTFilter(searchTerm);
  const breedDogIds = await dogIdsMatchingRegistrationBreed(sanitized);
  const orFilters = [`name.ilike.%${sanitized}%`, `call_name.ilike.%${sanitized}%`];
  if (breedDogIds.length > 0) {
    orFilters.push(`id.in.(${breedDogIds.join(',')})`);
  }

  const { data, error } = await supabase
    .from('dogs')
    .select('*, registrations:dog_registrations(*)')
    .or(ownedByPerson(personId))
    .or(orFilters.join(','))
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) throw createDatabaseError(error, 'dog', 'search');
  return { data: data || [], error: null };
}

async function postgrestGetDogsWithUpcomingShows(personId: string) {
  const { data, error } = await supabase
    .from('dogs')
    .select(
      `
      *,
      owner:people!dogs_owner_id_fkey(first_name, last_name),
      registrations:dog_registrations(*)
    `
    )
    .or(ownedByPerson(personId))
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) throw createDatabaseError(error, 'dog', 'select_with_upcoming_shows');
  return { data: data || [], error: null };
}

async function postgrestGetDogStatistics(personId: string) {
  const { error, count } = await supabase
    .from('dogs')
    .select('id', { count: 'exact', head: true })
    .or(ownedByPerson(personId))
    .is('deleted_at', null);

  if (error) throw createDatabaseError(error, 'dog', 'statistics');
  return { data: { total: count || 0 }, error: null };
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

// Get all dogs visible to the current user.
// showAll=true: skip ownership filter (for secretary/admin roles — RLS handles scoping).
// showAll=false (default): filter to own dogs (for exhibitor role).
export const getAllDogs = async (personId: string, showAll = false) => {
  return readWithReplicationFallback({
    replication: async () => {
      const allDogs = await replicatedDogsTable.getAllDogs();
      const filtered = showAll ? allDogs : filterByOwnership(allDogs, personId);
      const sortedDogs = sortedCopy(
        filtered,
        compareStringAsc(dog => dog.name)
      );
      // Batch-load owner and registration data from PostgREST (not replicated)
      const dogIds = sortedDogs.map(d => d.id);
      const ownerIds = sortedDogs.map(d => d.ownerId).filter((id): id is string => !!id);
      const [ownersMap, registrationsResult] = await Promise.all([
        loadOwnersMap(ownerIds),
        loadDogRegistrations(dogIds),
      ]);
      const data = mapDogsWithOwners(
        sortedDogs,
        ownersMap,
        registrationsResult.byDog,
        registrationsResult.registrationsReadComplete
      );
      return { data, error: null };
    },
    postgrest: () => postgrestGetAllDogs(personId, showAll),
    table: 'dog',
    operation: 'select_all_with_owners',
    errorData: [],
  });
};

// Get dog by ID with full details
// HYBRID: reads dog from replication, entries from replication,
// but uses PostgREST for owner details + dog_registrations + health_records (not replicated)
export const getDogById = async (id: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const dog = await replicatedDogsTable.getDogById(id);
      if (!dog) return { data: null, error: null };

      // Load entries from replication store
      const allEntries = await replicatedEntriesTable.getAll();
      const dogEntries = allEntries.filter(e => e.dogId === id);

      const [registrationsResult, supplementalResult] = await Promise.all([
        loadDogRegistrations([id]),
        supabase
          .from('dogs')
          .select(
            `
            owner:people!dogs_owner_id_fkey(
              id,
              first_name,
              last_name,
              email,
              phone,
              street_address,
              city,
              state,
              zip_code
            ),
            health_records(*)
          `
          )
          .eq('id', id)
          .single(),
      ]);

      const supplemental = supplementalResult.data;
      const owner = (supplemental as Record<string, unknown>)?.owner ?? null;
      const registrations = registrationsResult.byDog.get(id) ?? [];
      const healthRecords =
        ((supplemental as Record<string, unknown>)?.health_records as Record<string, unknown>[]) ??
        [];

      // Map entries to the shape PostgREST returns (with class/show sub-objects from snake_case)
      const entries = dogEntries.map(e => ({
        id: e.id,
        class_id: e.classId ?? null,
        show_id: e.showId ?? null,
        dog_id: e.dogId ?? null,
        handler_id: e.handlerId ?? null,
        armband: e.armband ?? null,
        handler: e.handler ?? null,
        entry_status: e.entryStatus ?? null,
        jump_height: e.jumpHeight ?? null,
        entry_fee: e.entryFee ?? null,
        payment_status: e.paymentStatus ?? null,
        run_order: e.runOrder ?? null,
        move_up_requested: e.moveUpRequested ?? null,
        preferred_judge: e.preferredJudge ?? null,
        special_requests: e.specialRequests ?? null,
        submitted_at: e.submittedAt ?? null,
        // class and show sub-objects not available from replication — set null
        class: null,
        show: null,
      }));

      const data = mapReplicatedDogToDbRow(dog, {
        owner: owner as Record<string, unknown> | null,
        registrations,
        registrationsReadComplete: registrationsResult.registrationsReadComplete,
        entries,
        healthRecords,
      });
      return { data, error: null };
    },
    postgrest: () => postgrestGetDogById(id),
    table: 'dog',
    operation: 'select_by_id_detailed',
    errorData: null,
  });
};

// Get dogs by owner ID
export const getDogsByOwner = async (ownerId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const dogs = await replicatedDogsTable.getDogsByOwner(ownerId);
      const sortedDogs = sortedCopy(
        dogs,
        compareStringAsc(dog => dog.name)
      );
      const registrationsResult = await loadDogRegistrations(sortedDogs.map(d => d.id));
      const data = sortedDogs.map(dog =>
        mapReplicatedDogToDbRow(dog, {
          registrations: registrationsResult.byDog.get(dog.id) ?? [],
          registrationsReadComplete: registrationsResult.registrationsReadComplete,
        })
      );
      return { data, error: null };
    },
    postgrest: () => postgrestGetDogsByOwner(ownerId),
    table: 'dog',
    operation: 'select_by_owner',
    errorData: [],
  });
};

// Create new dog
export const createDog = async (dogData: DbDogInsert) => {
  const startTime = Date.now();

  try {
    // Pass dogData directly — client-provided id (if any) is preserved so the
    // local-first IndexedDB write and the PostgREST INSERT share the same UUID.
    // Callers without an id will still get a database-generated UUID.
    const { data, error } = await supabase
      .from('dogs')
      .insert([dogData])
      .select(
        `
        *,
        owner:people!dogs_owner_id_fkey(
          id,
          first_name,
          last_name,
          email
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('dog', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dog', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'insert');
    logQuery('dog', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update dog
/**
 * `registrations` is embedded because `useUpdateDogMutation.onSuccess` maps this
 * response and writes it straight into the `dogs` LIST cache. Breed is resolved
 * from `dog_registrations` (MYK9-90), so without the embed that cache write
 * replaced a dog with a registration-less copy and its breed read as
 * "Breed not set" until the follow-up invalidation refetched. Harmless before
 * this change, when breed came from the `dogs.breed` column that `*` already
 * covered — which is exactly why it had to be added with it.
 */
export const updateDog = async (id: string, updates: DbDogUpdate) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('dogs')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(
        `
        *,
        owner:people!dogs_owner_id_fkey(
          id,
          first_name,
          last_name,
          email
        ),
        registrations:dog_registrations(*)
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('dog', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dog', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'update');
    logQuery('dog', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Soft delete dog (sets deleted_at timestamp and tracks who deleted it)
export const deleteDog = async (id: string, deletedBy?: string) => {
  const startTime = Date.now();

  logger.debug('🗑️ Database deleteDog called:', 'database', { data: { id, deletedBy } });

  try {
    const updateData: TablesUpdate<'dogs'> = {
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (deletedBy) {
      updateData.deleted_by = deletedBy;
    }

    logger.debug('📝 Update data being sent:', 'database', { data: updateData });

    // Use a SECURITY DEFINER RPC to bypass the dogs_update RLS WITH CHECK
    // restriction on deleted_at, while still enforcing ownership in the function.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.rpc as any)('soft_delete_dog', { p_dog_id: id });

    const duration = Date.now() - startTime;
    logQuery('dog', 'soft_delete', duration, error?.message);

    if (error) {
      logger.error('❌ Supabase error details:', 'database', {
        data: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
      });
      throw createDatabaseError(error, 'dog', 'soft_delete');
    }

    const data = {
      id,
      deleted_at: updateData.deleted_at as string,
      deleted_by: (updateData.deleted_by as string | null) ?? null,
    };
    logger.debug('📊 Soft delete succeeded:', 'database', { data });
    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'soft_delete');
    logQuery('dog', 'soft_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Default cap for searchAllDogs. Also used by UI to show a "refine your
// search" hint when the returned row count hits this limit.
export const SEARCH_ALL_DOGS_LIMIT = 50;

// Search dogs across the entire system (not scoped to ownership).
// Used by secretaries/admins entering mail-in registrations — the secretary
// rarely owns the dog being registered, so ownership-scoped search is useless.
// RLS still enforces that only privileged roles can read non-owned rows.
export const searchAllDogs = async (
  searchTerm: string,
  limit: number = SEARCH_ALL_DOGS_LIMIT
): Promise<{
  data: Record<string, unknown>[];
  error: DatabaseError | null;
  hitLimit: boolean;
}> => {
  const startTime = Date.now();
  try {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      return { data: [], error: null, hitLimit: false };
    }
    const sanitized = sanitizePostgRESTFilter(trimmed);

    // MYK9-90: registration number and registered name live on
    // `dog_registrations`. The old filter searched `dogs.akc_number`, which is
    // NULL for every row, so no dog was findable by registration number at all.
    // PostgREST cannot OR a parent-column filter with an embedded-table filter
    // in one request, so resolve matching dog ids first and fold them into the
    // same `.or(...)` as an id list.
    //
    // The pre-query's error is thrown, NOT swallowed. Treating a failed
    // registration lookup as "no matches" would make a transient PostgREST,
    // network, or authorization failure indistinguishable from "no such dog":
    // a registration-number search would return an empty list with
    // `error: null` while the backend was actually broken.
    const { data: regMatches, error: regError } = await supabase
      .from('dog_registrations')
      .select('dog_id')
      // Breed is a registration attribute, so it is matched here alongside the
      // number and registered name rather than against `dogs.breed`.
      .or(
        `registration_number.ilike.%${sanitized}%,registered_name.ilike.%${sanitized}%,breed.ilike.%${sanitized}%`
      )
      .limit(limit);
    if (regError) throw createDatabaseError(regError, 'dog', 'search_all');
    const registrationDogIds = [
      ...new Set(
        ((regMatches ?? []) as Array<{ dog_id?: string | null }>)
          .map(r => r.dog_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    ];

    const orFilters = [`name.ilike.%${sanitized}%`, `call_name.ilike.%${sanitized}%`];
    if (registrationDogIds.length > 0) {
      orFilters.push(`id.in.(${registrationDogIds.join(',')})`);
    }

    const { data, error } = await supabase
      .from('dogs')
      .select(
        `
        *,
        owner:people!dogs_owner_id_fkey(
          id,
          first_name,
          last_name,
          email,
          phone
        ),
        registrations:dog_registrations(*)
      `
      )
      .or(orFilters.join(','))
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(limit);

    const duration = Date.now() - startTime;
    logQuery('dog', 'search_all', duration, error?.message);

    if (error) throw createDatabaseError(error, 'dog', 'search_all');
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    return { data: rows, error: null, hitLimit: rows.length >= limit };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'search_all');
    logQuery('dog', 'search_all', duration, dbError.message);
    return { data: [], error: dbError, hitLimit: false };
  }
};

// Search dogs by name or breed, scoped to the given person's dogs
export const searchDogs = async (searchTerm: string, personId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const results = await replicatedDogsTable.searchDogs(searchTerm);
      const filtered = filterByOwnership(results, personId);
      const sortedDogs = sortedCopy(
        filtered,
        compareStringAsc(dog => dog.name)
      );
      // Registrations ARE needed even though the original query was select('*'):
      // breed lives on `dog_registrations`, so without them every offline result
      // would render "Breed not set".
      const registrationsResult = await loadDogRegistrations(sortedDogs.map(d => d.id));
      const data = sortedDogs.map(dog =>
        mapReplicatedDogToDbRow(dog, {
          registrations: registrationsResult.byDog.get(dog.id) ?? [],
          registrationsReadComplete: registrationsResult.registrationsReadComplete,
        })
      );
      return { data, error: null };
    },
    postgrest: () => postgrestSearchDogs(searchTerm, personId),
    table: 'dog',
    operation: 'search',
    errorData: [],
  });
};

// Get dogs with upcoming shows, scoped to the given person
export const getDogsWithUpcomingShows = async (personId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const allDogs = await replicatedDogsTable.getAllDogs();
      const filtered = filterByOwnership(allDogs, personId);
      const sortedDogs = sortedCopy(
        filtered,
        compareStringAsc(dog => dog.name)
      );
      // Batch-load owner names from PostgREST
      const ownerIds = sortedDogs.map(d => d.ownerId).filter((id): id is string => !!id);
      const [ownersMap, registrationsResult] = await Promise.all([
        loadOwnersMap(ownerIds),
        // Breed comes from the registration, so it has to be loaded even though
        // the original query only joined the owner.
        loadDogRegistrations(sortedDogs.map(d => d.id)),
      ]);
      // Original query only selects owner(first_name, last_name) — attach minimal owner
      const data = sortedDogs.map(dog => {
        const ownerRow = dog.ownerId ? (ownersMap.get(dog.ownerId) ?? null) : null;
        const owner = ownerRow
          ? { first_name: ownerRow.first_name, last_name: ownerRow.last_name }
          : null;
        return mapReplicatedDogToDbRow(dog, {
          owner,
          registrations: registrationsResult.byDog.get(dog.id) ?? [],
          registrationsReadComplete: registrationsResult.registrationsReadComplete,
        });
      });
      return { data, error: null };
    },
    postgrest: () => postgrestGetDogsWithUpcomingShows(personId),
    table: 'dog',
    operation: 'select_with_upcoming_shows',
    errorData: [],
  });
};

// Get dog statistics for the given person's dogs
export const getDogStatistics = async (personId: string) => {
  return readWithReplicationFallback({
    replication: async () => {
      const allDogs = await replicatedDogsTable.getAllDogs();
      const filtered = filterByOwnership(allDogs, personId);
      return { data: { total: filtered.length }, error: null };
    },
    postgrest: () => postgrestGetDogStatistics(personId),
    table: 'dog',
    operation: 'statistics',
    errorData: null,
  });
};

// Hard delete dog (permanent removal - admin only)
export const hardDeleteDog = async (id: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('dogs')
      .delete()
      .eq('id', id)
      .select('id, name')
      .single();

    const duration = Date.now() - startTime;
    logQuery('dog', 'hard_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dog', 'hard_delete');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'hard_delete');
    logQuery('dog', 'hard_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Restore soft-deleted dog (admin only)
export const restoreDog = async (id: string, restoredBy?: string) => {
  const startTime = Date.now();
  void restoredBy;

  try {
    // dogs_select RLS hides soft-deleted rows from every role, so a direct
    // UPDATE matches 0 rows (the SELECT policy gates the UPDATE's row-location
    // step). Restore via an admin-gated SECURITY DEFINER RPC that also
    // cascade-restores the dog's cascade-deleted entries (migration 20260617120000).
    const { data, error } = await supabase.rpc('restore_dog', { p_dog_id: id });

    const duration = Date.now() - startTime;
    logQuery('dog', 'restore', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dog', 'restore');
    }

    const restored = Array.isArray(data) ? data[0] : data;
    return { data: restored ?? null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'restore');
    logQuery('dog', 'restore', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Get soft-deleted dogs (admin only)
export const getDeletedDogs = async () => {
  const startTime = Date.now();

  try {
    // dogs_select RLS hides soft-deleted rows from every role, so list them via
    // an admin-gated SECURITY DEFINER RPC (migration 20260616140000).
    const { data, error } = await supabase.rpc('get_deleted_dogs');

    const duration = Date.now() - startTime;
    logQuery('dog', 'select_deleted', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dog', 'select_deleted');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'select_deleted');
    logQuery('dog', 'select_deleted', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

export interface OwnedLiveDog {
  id: string;
  name: string;
}

// Live dogs a person is the PRIMARY owner of (owner_id). Drives the
// delete-person guard: a person who owns live dogs can't be deleted (the DB
// trigger from migration 20260617130000 enforces it; this powers the friendly
// pre-check). Direct PostgREST read — admins can see these via RLS, and the guard
// must be accurate regardless of replication sync state. Co-owned dogs are
// excluded on purpose: they keep their primary owner, so they aren't orphaned.
export const getOwnedLiveDogsByPerson = async (personId: string): Promise<OwnedLiveDog[]> => {
  const { data, error } = await supabase
    .from('dogs')
    .select('id, call_name, name')
    .eq('owner_id', personId)
    .is('deleted_at', null)
    .order('call_name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(d => ({ id: d.id, name: d.call_name || d.name || 'Unnamed dog' }));
};
