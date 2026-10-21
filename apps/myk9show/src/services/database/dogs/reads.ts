// Dog-related database queries
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.
import { supabase, logQuery, createDatabaseError, type DatabaseError } from '../supabaseClient';
import { compareStringAsc, sortedCopy } from '../_shared/read-shape';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { logger } from '@/services/LoggingService';
import type { DbDogInsert, DbDogUpdate } from '../../../types/database-mappings';
import type { TablesUpdate } from '@/types/supabase';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { mapReplicatedDogToDbRow } from '@/services/mappers/dogMappers';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import { selectOwnedDogs } from '@/utils/dogOwnership';
import {
  normalizeDogRegistrationNumber,
  normalizeDogRegistrationOrganization,
} from '@/utils/dogIdentity';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import {
  registrationToDbRow,
  type ReplicatedDogRegistration,
} from '@/services/replication/dogRegistrationRows';
import { mergeUnsentWork } from '@/services/replication/dogRegistrationMerge';
import { parseRestoreDogResult } from './restoreDogResult';
import { DOG_READ_PAGE_SIZE, readAllDogPages, readRosterServerFirst } from './rosterRead';
import { ownerNameCacheKey, recallOwnerNames, rememberOwnerNames } from './ownerNameCache';
import { attachRosterRelations, groupRegistrationsByDog } from './serverRosterRows';
import { serverUnreachable } from '../registrations/serverUnreachable';
import { unsentWorkProvenByServer } from '../registrations/unsentWork';

// PostgREST OR filter for dogs owned or co-owned by a person
const ownedByPerson = (personId: string) => `owner_id.eq.${personId},co_owner_id.eq.${personId}`;

/**
 * Filter replicated dogs by ownership (owner or co-owner).
 * The filter itself is owner-only. ReplicatedDog now carries `coOwnerId`
 * (MYK9-912; already-synced devices pick it up on the 24h full sync), but a
 * co-owned dog the viewer does not primary-own is still caught by the PostgREST
 * fallback, not by this filter.
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
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

// MYK9-1010: the address is read with the owner (here and in the PostgREST
// embed below) so an AKC entry can be blocked in the wizard until it is
// complete. Inlined, not a constant: peopleJuniorHandlerPiiContract audits
// every people column list.
async function loadOwnersMap(
  ownerIds: string[],
  cacheKey = ownerNameCacheKey()
): Promise<{
  map: Map<string, OwnerRow>;
  recalled: Map<string, string>;
  readFailed: boolean;
  /** An error the server ANSWERED with (RLS, 4xx/5xx), as opposed to being unreachable. */
  answeredError: unknown;
}> {
  const map = new Map<string, OwnerRow>();
  // Device-remembered display names only. Never an owner row: the address is unknown offline.
  const recalled = new Map<string, string>();
  if (ownerIds.length === 0) return { map, recalled, readFailed: false, answeredError: null };
  const uniqueIds = [...new Set(ownerIds)];
  let data: OwnerRow[] | null = null;
  let readFailed = serverUnreachable(null);
  let answeredError: unknown = null;
  if (!readFailed) {
    // Batched, in parallel: the filter travels in the URL, and the server roster now reads
    // every owner this way (MYK9-1303, as MYK9-272 did for registrations).
    const results = await Promise.all(
      chunk(uniqueIds, ID_CHUNK_SIZE).map(async batch => {
        try {
          const result = await supabase
            .from('people')
            .select(
              'id, first_name, last_name, email, phone, street_address, city, state, zip_code'
            )
            .in('id', batch);
          return { rows: (result.data ?? []) as OwnerRow[], error: result.error, thrown: false };
        } catch (error) {
          return { rows: [] as OwnerRow[], error, thrown: true };
        }
      })
    );
    for (const result of results) {
      data = [...(data ?? []), ...result.rows];
      // Only an unreachable server reads as offline; an answered error is not "offline".
      if (result.thrown || serverUnreachable(result.error)) readFailed = true;
      else if (result.error) answeredError = answeredError ?? result.error;
    }
  }
  if (data) {
    for (const row of data) map.set(row.id, row);
    rememberOwnerNames(data, cacheKey);
  }
  if (readFailed) {
    // MYK9-1189: no signal, so the owner names the list showed online come from the device.
    for (const [id, owner] of recallOwnerNames(uniqueIds, cacheKey)) {
      if (!map.has(id)) recalled.set(id, `${owner.first_name} ${owner.last_name}`.trim());
    }
  }
  return { map, recalled, readFailed, answeredError };
}

export function appendRegistrations(
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
 * These dogs' registrations, plus whether the read was complete and where it
 * came from (MYK9-1090).
 *
 * Server first. A successful PostgREST read is merged with ONLY this device's
 * unsent work (dirty rows, offline-created placeholders), never its clean
 * cached copies, which may be rows the server no longer returns.
 *
 * When the server read fails (offline, network error), the device copy
 * answers: every registration the replica holds for these dogs. It is labelled
 * `source: 'device'` and is never complete, so callers that print paperwork
 * must tell "has none" from "could not read" rather than rendering a blank
 * (MYK9-90 review round 3), and screens can say it is an offline copy.
 */
export interface DogRegistrationsResult {
  byDog: Map<string, Record<string, unknown>[]>;
  serverError: unknown | null;
  registrationsReadComplete: boolean;
  /** `device`: the server could not be read; this is the offline copy. */
  source: 'server' | 'device';
}

async function readServerRegistrations(dogIds: string[]): Promise<{
  data: Record<string, unknown>[] | null;
  error: unknown;
  answered: number;
  /** The dogs of batches the server could not be reached for. */
  unreachableDogIds: string[];
}> {
  // A thrown network error must surface as `error`, not reject the whole
  // read: the device copy may still be able to answer.
  try {
    // Batched, not one `.in(...)`: the filter travels in the URL, so an
    // unbounded id list produces a request the server rejects outright.
    // A secretary gathering dogs across every managed show sent 200+ ids
    // and the read failed every time, reported by the browser as a CORS
    // error because the rejection carries no CORS headers (MYK9-272).
    const rows: Record<string, unknown>[] = [];
    let firstError: unknown = null;
    let answered = 0;
    const unreachableDogIds: string[] = [];
    // In parallel, results consumed in batch order.
    const batches = chunk(dogIds, ID_CHUNK_SIZE);
    const results = await Promise.all(
      batches.map(batch =>
        supabase
          .from('dog_registrations')
          // Keep this list narrow: this read hydrates the dog roster and only
          // needs identity/order fields plus the display metadata.
          .select(
            'dog_id, id, created_at, is_primary, registered_name, registration_number, registration_date, organization, variety, breed, status'
          )
          .in('dog_id', batch)
      )
    );
    results.forEach((result, index) => {
      const batch = batches[index]!;
      // Keep going after a failed batch, and return the rows that did
      // arrive alongside the error. #1490 established that a partial read
      // stays VISIBLE and is reported as incomplete rather than discarded;
      // dropping it here would make those dogs read as having no
      // registrations at all.
      if (result.error) firstError = firstError ?? result.error;
      else answered++;
      if (result.error && serverUnreachable(result.error)) unreachableDogIds.push(...batch);
      rows.push(...((result.data ?? []) as Record<string, unknown>[]));
    });
    return { data: rows, error: firstError, answered, unreachableDogIds };
  } catch (error) {
    return { data: null, error, answered: 0, unreachableDogIds: dogIds };
  }
}

export async function loadDogRegistrations(dogIds: string[]): Promise<DogRegistrationsResult> {
  if (dogIds.length === 0) {
    return {
      byDog: new Map(),
      serverError: null,
      registrationsReadComplete: true,
      source: 'server',
    };
  }
  const map = new Map<string, Record<string, unknown>[]>();
  const serverResult = await readServerRegistrations(dogIds);
  // The device copy answers only when the server could not be reached. A
  // server that answered with an error stays a server read: unsent work is
  // merged, `serverError` is set and the read is not complete.
  // A batch that could not be reached does not discard the batches the
  // server answered (Codex round 3): those stay a server read, incomplete.
  const source =
    serverResult.error && serverResult.answered === 0 && serverUnreachable(serverResult.error)
      ? 'device'
      : 'server';
  // Per dog (Codex round 5): the dogs of an unreachable batch answer from
  // the device copy, clean rows included; the answered dogs keep the
  // server's rows with this device's unsent work applied (mergeUnsentWork).
  const unreachable = new Set(source === 'device' ? dogIds : serverResult.unreachableDogIds);
  const answeredDogIds = dogIds.filter(id => !unreachable.has(id));
  let unsent: ReplicatedDogRegistration[] = [];
  let deviceRows: Record<string, unknown>[] = [];
  let localError: unknown = null;
  try {
    if (answeredDogIds.length > 0) {
      unsent = await unsentWorkProvenByServer(answeredDogIds, serverResult.data);
    }
    if (unreachable.size > 0) {
      deviceRows = await replicatedDogRegistrationsTable.getRegistrationsForDogs([...unreachable]);
    }
  } catch (error) {
    localError = error;
  }

  if (answeredDogIds.length > 0)
    appendRegistrations(map, mergeUnsentWork(serverResult.data, unsent));
  appendRegistrations(map, deviceRows);
  const localRows = [
    ...unsent.filter(row => row._pendingDelete !== true).map(registrationToDbRow),
    ...deviceRows,
  ];
  overlayLocalCreationOrder(map, localRows);
  return {
    byDog: map,
    serverError: serverResult.error ?? null,
    // A device read failure may hide a pending local-only row, even when the
    // server returned registrations. Keep those rows for display, but mark the
    // merged read incomplete so callers that require verified data can refuse
    // to proceed. The offline copy is never complete.
    registrationsReadComplete: source === 'server' && !serverResult.error && !localError,
    source,
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
  registrationsReadComplete: boolean,
  ownersReadFailed = false,
  recalledNames: ReadonlyMap<string, string> = new Map()
): Record<string, unknown>[] {
  return dogs.map(dog => {
    const owner = dog.ownerId ? (ownersMap.get(dog.ownerId) ?? null) : null;
    const registrations = registrationsMap.get(dog.id) ?? [];
    const recalledName = dog.ownerId && !owner ? recalledNames.get(dog.ownerId) : undefined;
    return mapReplicatedDogToDbRow(dog, {
      owner: owner as Record<string, unknown> | null,
      ...(recalledName ? { ownerDisplayName: recalledName } : {}),
      registrations,
      registrationsReadComplete,
      // An owner that could not be read and was never remembered is said so, not left blank.
      ...(ownersReadFailed && dog.ownerId && !owner && !recalledNames.has(dog.ownerId)
        ? { ownerUnavailableOffline: true }
        : {}),
    });
  });
}

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

async function postgrestGetAllDogs(personId: string, showAll = false) {
  const buildQuery = () => {
    const query = supabase
      .from('dogs')
      .select('*')
      .is('deleted_at', null)
      .order(showAll ? 'id' : 'name', { ascending: true });
    return showAll ? query : query.or(ownedByPerson(personId));
  };

  if (showAll) {
    // A secretary's or admin's roster can pass the server's per-response row cap:
    // keyset pages on `id`, then the roster's name order.
    const rows = await readAllDogPages(afterId => {
      let page = buildQuery().limit(DOG_READ_PAGE_SIZE);
      if (afterId !== undefined) page = page.gt('id', afterId);
      return page;
    });
    return {
      data: sortedCopy(
        rows,
        compareStringAsc(dog => dog.name)
      ),
      error: null,
    };
  }
  const { data, error } = await buildQuery();
  if (error) throw createDatabaseError(error, 'dog', 'select_all');
  return { data: data || [], error: null };
}

async function postgrestGetDogsByOwner(ownerId: string) {
  // Registrations are attached by `loadDogRegistrations` (MYK9-1303), which
  // reads the identity/order fields `mapDatabaseToDog` resolves the PRIMARY
  // registration from; this read is dogs columns only.
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
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
    .select('*')
    .or(ownedByPerson(personId))
    .or(orFilters.join(','))
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) throw createDatabaseError(error, 'dog', 'search');
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

/**
 * Server dog rows plus their registrations (and owners, when asked), by batched
 * id lookups instead of embeds (MYK9-1303). Server-only: no merge with this
 * device's queue, and a registrations or answered owner failure fails the read.
 */
async function withServerRelations(
  dogs: Record<string, unknown>[],
  operation: string,
  owners?: { cacheKey: ReturnType<typeof ownerNameCacheKey> }
): Promise<Record<string, unknown>[]> {
  const ownerIds = owners
    ? dogs.map(d => d.owner_id).filter((id): id is string => typeof id === 'string')
    : [];
  const [ownerMaps, registrations] = await Promise.all([
    owners ? loadOwnersMap(ownerIds, owners.cacheKey) : undefined,
    dogs.length > 0 ? readServerRegistrations(dogs.map(d => String(d.id))) : undefined,
  ]);
  if (ownerMaps?.answeredError)
    throw createDatabaseError(ownerMaps.answeredError, 'dog', operation);
  if (registrations?.error) throw createDatabaseError(registrations.error, 'dog', operation);
  return attachRosterRelations(dogs, groupRegistrationsByDog(registrations?.data ?? []), ownerMaps);
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

/** Device dogs as roster rows, name order, with the registrations the roster reads. */
async function hydrateWithRegistrations(dogs: ReplicatedDog[]): Promise<Record<string, unknown>[]> {
  const sortedDogs = sortedCopy(
    dogs,
    compareStringAsc(dog => dog.name)
  );
  const registrationsResult = await loadDogRegistrations(sortedDogs.map(d => d.id));
  return sortedDogs.map(dog =>
    mapReplicatedDogToDbRow(dog, {
      registrations: registrationsResult.byDog.get(dog.id) ?? [],
      registrationsReadComplete: registrationsResult.registrationsReadComplete,
    })
  );
}

// Get all dogs visible to the current user.
// showAll=true: skip ownership filter (for secretary/admin roles — RLS handles scoping).
// showAll=false (default): filter to own dogs (for exhibitor role).
export const getAllDogs = async (personId: string, showAll = false) => {
  const hydrate = async (sortedDogs: ReplicatedDog[]) => {
    // Batch-load owner and registration data from PostgREST (not replicated)
    const dogIds = sortedDogs.map(d => d.id);
    const ownerIds = sortedDogs.map(d => d.ownerId).filter((id): id is string => !!id);
    const [owners, registrationsResult] = await Promise.all([
      loadOwnersMap(ownerIds),
      loadDogRegistrations(dogIds),
    ]);
    return mapDogsWithOwners(
      sortedDogs,
      owners.map,
      registrationsResult.byDog,
      registrationsResult.registrationsReadComplete,
      owners.readFailed,
      owners.recalled
    );
  };
  return readRosterServerFirst<Record<string, unknown>[]>({
    server: async () => {
      const cacheKey = ownerNameCacheKey();
      const result = await postgrestGetAllDogs(personId, showAll);
      // MYK9-1189: `loadOwnersMap` keeps the owner names this list shows, for the offline read,
      // under the key taken BEFORE the dogs read, so an account switch mid-read cannot re-file them.
      return { data: await withServerRelations(result.data, 'select_all', { cacheKey }) };
    },
    device: async () => {
      // A cold or unreadable local store returns zero rows with no error, which
      // downstream reads as "this user owns no dogs". Throw instead, so an
      // offline cold boot surfaces an error the UI can hold rather than a
      // false empty roster.
      const { rows: allDogs, cold } = await replicatedDogsTable.getAllDogsWithStatus();
      if (cold) throw new Error('[dogs] local replica is cold and the server is unreachable');
      const filtered = showAll ? allDogs : filterByOwnership(allDogs, personId);
      const sortedDogs = sortedCopy(
        filtered,
        compareStringAsc(dog => dog.name)
      );
      return { data: await hydrate(sortedDogs) };
    },
    table: 'dog',
    operation: 'select_all_with_owners',
    errorData: [],
  });
};

// Get dogs by owner ID
export const getDogsByOwner = async (ownerId: string) => {
  return readRosterServerFirst<Record<string, unknown>[]>({
    server: async () => ({
      data: await withServerRelations(
        (await postgrestGetDogsByOwner(ownerId)).data,
        'select_by_owner'
      ),
    }),
    device: async () => ({
      data: await hydrateWithRegistrations(await replicatedDogsTable.getDogsByOwner(ownerId)),
    }),
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
    const { error } = await supabase.rpc('soft_delete_dog', { p_dog_id: id });

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

/**
 * Platform-admin override for the MK002 refusal (migration 20260915214500).
 *
 * `deleteDog` above calls `soft_delete_dog`, which refuses when the dog has live
 * paid or scored entries. `force_delete_dog` performs the same soft delete and
 * the same cascade WITHOUT that guard, and is gated on `is_platform_admin()`
 * inside the function — the UI gate is a convenience, not the security boundary.
 *
 * This issues no refund: a force-deleted paid entry leaves its Stripe charge
 * captured. Callers must say so before offering it.
 */
export const forceDeleteDog = async (
  id: string
): Promise<{
  data: null;
  error: DatabaseError | null;
}> => {
  const startTime = Date.now();

  logger.debug('🗑️ Database forceDeleteDog called:', 'database', { data: { id } });

  try {
    // Typed: a typo'd argument key or a future signature change fails the
    // typecheck instead of 404-ing at runtime on a destructive admin path.
    const { error } = await supabase.rpc('force_delete_dog', { p_dog_id: id });

    const duration = Date.now() - startTime;
    logQuery('dog', 'force_delete', duration, error?.message);

    if (error) {
      logger.error('❌ Supabase error details:', 'database', {
        data: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
      });
      throw createDatabaseError(error, 'dog', 'force_delete');
    }

    // MYK9-600: no synthesised row. `force_delete_dog` returns void and the
    // SERVER stamps `deleted_at` (and `deleted_by`, from `auth.uid()`). This
    // used to return `{ id, deleted_at: <client clock>, deleted_by: null }`,
    // which is wrong twice over: the timestamp is the browser's, not the row's,
    // and `restore_dog` keys on the exact `deleted_at`. A value that merely
    // looks right is worse than none — nothing typechecks it against the row.
    // No consumer reads it: `useDogDeleteMutation` ignores the resolved value
    // in `onSuccess`.
    logger.debug('📊 Force delete succeeded:', 'database', { data: { id } });
    return { data: null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'force_delete');
    logQuery('dog', 'force_delete', duration, dbError.message);
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
  limit: number = SEARCH_ALL_DOGS_LIMIT,
  signal?: AbortSignal
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
    const registrationQuery = supabase
      .from('dog_registrations')
      .select('dog_id')
      // Breed is a registration attribute, so it is matched here alongside the
      // number and registered name rather than against `dogs.breed`.
      .or(
        `registration_number.ilike.%${sanitized}%,registered_name.ilike.%${sanitized}%,breed.ilike.%${sanitized}%`
      )
      .limit(limit);
    const { data: regMatches, error: regError } = signal
      ? await registrationQuery.abortSignal(signal)
      : await registrationQuery;
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

    const dogQuery = supabase
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
    const { data, error } = signal ? await dogQuery.abortSignal(signal) : await dogQuery;

    const duration = Date.now() - startTime;
    logQuery('dog', 'search_all', duration, error?.message);

    if (error) throw createDatabaseError(error, 'dog', 'search_all');
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    return { data: rows, error: null, hitLimit: rows.length >= limit };
  } catch (error) {
    // React Query treats an aborted query as a superseded request. Preserve
    // that cancellation signal instead of converting it into a search error
    // for the current query.
    if (signal?.aborted) throw error;
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'dog', 'search_all');
    logQuery('dog', 'search_all', duration, dbError.message);
    return { data: [], error: dbError, hitLimit: false };
  }
};

// Search dogs by name or breed, scoped to the given person's dogs
export const searchDogs = async (searchTerm: string, personId: string) => {
  return readRosterServerFirst<Record<string, unknown>[]>({
    server: async () => ({
      data: await withServerRelations(
        (await postgrestSearchDogs(searchTerm, personId)).data,
        'search'
      ),
    }),
    device: async () => {
      const results = await replicatedDogsTable.searchDogs(searchTerm);
      // Registrations ARE needed even though the original query was select('*'):
      // breed lives on `dog_registrations`, so without them every offline result
      // would render "Breed not set".
      return { data: await hydrateWithRegistrations(filterByOwnership(results, personId)) };
    },
    table: 'dog',
    operation: 'search',
    errorData: [],
  });
};

// Get dog statistics for the given person's dogs
export const getDogStatistics = async (personId: string) => {
  return readRosterServerFirst<{ total: number } | null>({
    server: () => postgrestGetDogStatistics(personId),
    device: async () => {
      const allDogs = await replicatedDogsTable.getAllDogs();
      return { data: { total: filterByOwnership(allDogs, personId).length } };
    },
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

    // jsonb since 20260924104100: counts plus any placement NOT re-applied (MYK9-607).
    return { data: parseRestoreDogResult(data), error: null };
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
