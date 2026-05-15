// Dog-related database queries
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (create, update, delete) remain on PostgREST.
import { supabase, logQuery, createDatabaseError, type DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from '../_shared/replication-fallback';
import { sanitizePostgRESTFilter } from '@/utils/sanitizePostgRESTFilter';
import { logger } from '@/services/LoggingService';
import type { DbDogInsert, DbDogUpdate } from '../../../types/database-mappings';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { mapReplicatedDogToDbRow } from '@/services/mappers/dogMappers';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

// PostgREST OR filter for dogs owned or co-owned by a person
const ownedByPerson = (personId: string) => `owner_id.eq.${personId},co_owner_id.eq.${personId}`;

/**
 * Filter replicated dogs by ownership (owner or co-owner).
 * Note: ReplicatedDog only has `ownerId` — co_owner_id is not replicated.
 * Co-owned dogs that are not primary-owned will be caught by the PostgREST fallback.
 */
function filterByOwnership(dogs: ReplicatedDog[], personId: string): ReplicatedDog[] {
  return dogs.filter(d => d.ownerId === personId);
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

// Registrations are not replicated to IndexedDB, so batch-load them from
// PostgREST whenever we build the dog list from the replication store.
async function loadRegistrationsMap(
  dogIds: string[]
): Promise<Map<string, Record<string, unknown>[]>> {
  if (dogIds.length === 0) return new Map();
  const { data } = await supabase.from('dog_registrations').select('*').in('dog_id', dogIds);
  const map = new Map<string, Record<string, unknown>[]>();
  if (data) {
    for (const row of data) {
      const dogId = row.dog_id as string;
      const existing = map.get(dogId) ?? [];
      existing.push(row as Record<string, unknown>);
      map.set(dogId, existing);
    }
  }
  return map;
}

/**
 * Map an array of ReplicatedDog to DB-row-shaped objects, attaching owner
 * and registration sub-objects from pre-loaded maps.
 */
function mapDogsWithOwners(
  dogs: ReplicatedDog[],
  ownersMap: Map<string, OwnerRow>,
  registrationsMap: Map<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  return dogs.map(dog => {
    const owner = dog.ownerId ? (ownersMap.get(dog.ownerId) ?? null) : null;
    const registrations = registrationsMap.get(dog.id) ?? [];
    return mapReplicatedDogToDbRow(dog, {
      owner: owner as Record<string, unknown> | null,
      registrations,
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
    .select('*, registrations:dog_registrations(id,breed,organization,status)')
    .eq('owner_id', ownerId)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  if (error) throw createDatabaseError(error, 'dog', 'select_by_owner');
  return { data: data || [], error: null };
}

async function postgrestSearchDogs(searchTerm: string, personId: string) {
  const sanitized = sanitizePostgRESTFilter(searchTerm);
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .or(ownedByPerson(personId))
    .or(`name.ilike.%${sanitized}%,breed.ilike.%${sanitized}%,call_name.ilike.%${sanitized}%`)
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
      owner:people!dogs_owner_id_fkey(first_name, last_name)
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
  try {
    return await withReplicationFallback(
      async () => {
        const allDogs = await replicatedDogsTable.getAllDogs();
        const filtered = showAll ? allDogs : filterByOwnership(allDogs, personId);
        // Sort by name ascending (matching original PostgREST behavior)
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        // Batch-load owner and registration data from PostgREST (not replicated)
        const dogIds = filtered.map(d => d.id);
        const ownerIds = filtered.map(d => d.ownerId).filter((id): id is string => !!id);
        const [ownersMap, registrationsMap] = await Promise.all([
          loadOwnersMap(ownerIds),
          loadRegistrationsMap(dogIds),
        ]);
        const data = mapDogsWithOwners(filtered, ownersMap, registrationsMap);
        return { data, error: null };
      },
      () => postgrestGetAllDogs(personId, showAll),
      'dog',
      'select_all_with_owners'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get dog by ID with full details
// HYBRID: reads dog from replication, entries from replication,
// but uses PostgREST for owner details + dog_registrations + health_records (not replicated)
export const getDogById = async (id: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const dog = await replicatedDogsTable.getDogById(id);
        if (!dog) return { data: null, error: null };

        // Load entries from replication store
        const allEntries = await replicatedEntriesTable.getAll();
        const dogEntries = allEntries.filter(e => e.dogId === id);

        // Load owner, registrations, and health records from PostgREST (not replicated)
        const { data: supplemental } = await supabase
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
            registrations:dog_registrations(*),
            health_records(*)
          `
          )
          .eq('id', id)
          .single();

        const owner = (supplemental as Record<string, unknown>)?.owner ?? null;
        const registrations =
          ((supplemental as Record<string, unknown>)?.registrations as Record<string, unknown>[]) ??
          [];
        const healthRecords =
          ((supplemental as Record<string, unknown>)?.health_records as Record<
            string,
            unknown
          >[]) ?? [];

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
          entries,
          healthRecords,
        });
        return { data, error: null };
      },
      () => postgrestGetDogById(id),
      'dog',
      'select_by_id_detailed'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
};

// Get dogs by owner ID
export const getDogsByOwner = async (ownerId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const dogs = await replicatedDogsTable.getDogsByOwner(ownerId);
        dogs.sort((a, b) => a.name.localeCompare(b.name));
        const registrationsMap = await loadRegistrationsMap(dogs.map(d => d.id));
        const data = dogs.map(dog =>
          mapReplicatedDogToDbRow(dog, { registrations: registrationsMap.get(dog.id) ?? [] })
        );
        return { data, error: null };
      },
      () => postgrestGetDogsByOwner(ownerId),
      'dog',
      'select_by_owner'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
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
        )
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
    const updateData: Record<string, unknown> = {
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
      .or(
        `name.ilike.%${sanitized}%,call_name.ilike.%${sanitized}%,breed.ilike.%${sanitized}%,akc_number.ilike.%${sanitized}%`
      )
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
  try {
    return await withReplicationFallback(
      async () => {
        const results = await replicatedDogsTable.searchDogs(searchTerm);
        const filtered = filterByOwnership(results, personId);
        // Sort by name ascending (matching original PostgREST behavior)
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        // No joins needed — minimal query matching original select('*')
        const data = filtered.map(dog => mapReplicatedDogToDbRow(dog));
        return { data, error: null };
      },
      () => postgrestSearchDogs(searchTerm, personId),
      'dog',
      'search'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get dogs with upcoming shows, scoped to the given person
export const getDogsWithUpcomingShows = async (personId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const allDogs = await replicatedDogsTable.getAllDogs();
        const filtered = filterByOwnership(allDogs, personId);
        // Sort by name ascending (matching original PostgREST behavior)
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        // Batch-load owner names from PostgREST
        const ownerIds = filtered.map(d => d.ownerId).filter((id): id is string => !!id);
        const ownersMap = await loadOwnersMap(ownerIds);
        // Original query only selects owner(first_name, last_name) — attach minimal owner
        const data = filtered.map(dog => {
          const ownerRow = dog.ownerId ? (ownersMap.get(dog.ownerId) ?? null) : null;
          const owner = ownerRow
            ? { first_name: ownerRow.first_name, last_name: ownerRow.last_name }
            : null;
          return mapReplicatedDogToDbRow(dog, { owner });
        });
        return { data, error: null };
      },
      () => postgrestGetDogsWithUpcomingShows(personId),
      'dog',
      'select_with_upcoming_shows'
    );
  } catch (error) {
    return { data: [], error: error as DatabaseError };
  }
};

// Get dog statistics for the given person's dogs
export const getDogStatistics = async (personId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const allDogs = await replicatedDogsTable.getAllDogs();
        const filtered = filterByOwnership(allDogs, personId);
        return { data: { total: filtered.length }, error: null };
      },
      () => postgrestGetDogStatistics(personId),
      'dog',
      'statistics'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
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

  try {
    const updateData: Record<string, unknown> = {
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date().toISOString(),
    };

    if (restoredBy) {
      updateData.updated_by = restoredBy;
    }

    const { data, error } = await supabase
      .from('dogs')
      .update(updateData)
      .eq('id', id)
      .select('id, name')
      .single();

    const duration = Date.now() - startTime;
    logQuery('dog', 'restore', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'dog', 'restore');
    }

    return { data, error: null };
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
    const { data, error } = await supabase
      .from('dogs')
      .select(
        `
        *,
        owner:people!dogs_owner_id_fkey(id, first_name, last_name, email)
`
      )
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

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
