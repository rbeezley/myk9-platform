// Armband-related database queries
//
// SELECT functions read from the replication store (IndexedDB) with PostgREST fallback.
// Mutation functions (assignArmband) stay on PostgREST (RPC call — DO NOT CHANGE).

import { supabase, createDatabaseError , type DatabaseError } from '../supabaseClient';
import { withReplicationFallback } from '../_shared/replication-fallback';
import { replicatedArmbandsTable } from '@/services/replication/ReplicatedArmbandsTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { mapArmbandLookup } from '@/services/mappers/armbandMappers';

// ---------------------------------------------------------------------------
// PostgREST fallback wrappers (original implementations)
// ---------------------------------------------------------------------------

async function postgrestGetArmbandCountForShow(showId: string) {
  const { count, error } = await supabase
    .from('armbands')
    .select('id', { count: 'exact', head: true })
    .eq('show_id', showId);

  if (error) {
    return {
      count: 0,
      error: error as DatabaseError,
    };
  }

  return { count: count ?? 0, error: null };
}

async function postgrestLookupDogByArmband(showId: string, armbandNumber: string) {
  // Step 1: Find the armband record with dog and owner joins
  const { data: armbandData, error: armbandError } = await supabase
    .from('armbands')
    .select(
      `
      armband_number,
      dog:dogs (
        id,
        name,
        breed,
        sex,
        owner:people!dogs_owner_fkey (
          first_name,
          last_name
        )
      )
    `
    )
    .eq('show_id', showId)
    .eq('armband_number', armbandNumber)
    .maybeSingle();

  if (armbandError) {
    return {
      data: null,
      error: createDatabaseError(armbandError, 'armbands', 'lookup_by_armband'),
    };
  }

  if (!armbandData) {
    return { data: null, error: null };
  }

  const dog = armbandData.dog as unknown as {
    id: string;
    name: string;
    breed: string;
    sex: string;
    owner: { first_name: string; last_name: string } | null;
  } | null;

  if (!dog) {
    return { data: null, error: null };
  }

  const owner = dog.owner ?? { first_name: 'Unknown', last_name: '' };

  // Step 2: Get entries for this dog in the show
  const { data: entriesData, error: entriesError } = await supabase
    .from('entries')
    .select(
      `
      id,
      entry_status,
      handler,
      class:class_id (
        name,
        level
      )
    `
    )
    .eq('dog_id', dog.id)
    .eq('show_id', showId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (entriesError) {
    return {
      data: null,
      error: createDatabaseError(entriesError, 'entries', 'lookup_entries_for_dog'),
    };
  }

  const entries = (entriesData ?? []).map(entry => {
    const classData = entry.class as unknown as {
      name: string;
      level: string | null;
    } | null;

    return {
      id: entry.id,
      entry_status: entry.entry_status,
      handler: entry.handler,
      class_name: classData?.name ?? '',
      class_level: classData?.level ?? null,
    };
  });

  return {
    data: {
      armband_number: armbandData.armband_number,
      dog: { id: dog.id, name: dog.name, breed: dog.breed, sex: dog.sex },
      owner,
      entries,
    },
    error: null,
  };
}

// ---------------------------------------------------------------------------
// SELECT functions — read from replication store, fallback to PostgREST
// ---------------------------------------------------------------------------

/**
 * Get the count of armbands assigned for a given show.
 */
export const getArmbandCountForShow = async (showId: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const armbands = await replicatedArmbandsTable.getByShow(showId);
        return { count: armbands.length, error: null };
      },
      () => postgrestGetArmbandCountForShow(showId),
      'armbands',
      'count_for_show'
    );
  } catch (error) {
    return { count: 0, error: error as DatabaseError };
  }
};

/**
 * Assign an armband number to a dog for a given show via the assign_armband RPC.
 * Returns the assigned armband number string, or null if assignment failed.
 */
export const assignArmband = async (
  showId: string,
  dogId: string
): Promise<{ armband: string | null; error: unknown }> => {
  try {
    const { data, error } = await supabase.rpc(
      'assign_armband' as never,
      {
        p_show_id: showId,
        p_dog_id: dogId,
      } as never
    );
    if (!error && data != null) {
      const armband = String(data);
      const { error: updateError } = await supabase
        .from('entries')
        .update({ armband, updated_at: new Date().toISOString() })
        .eq('show_id', showId)
        .eq('dog_id', dogId)
        .is('deleted_at', null);

      if (updateError) {
        return {
          armband: null,
          error: createDatabaseError(updateError, 'entries', 'sync_assigned_armband'),
        };
      }

      return { armband, error: null };
    }
    return { armband: null, error: error ?? null };
  } catch (error) {
    return { armband: null, error };
  }
};

/**
 * Look up a dog by armband number within a show.
 * Returns dog info, owner, and all entries for that dog in the show.
 *
 * Uses replication for armband/dog/entry/class data.
 * Owner data falls back to PostgREST (people table is not replicated).
 */
export const lookupDogByArmband = async (showId: string, armbandNumber: string) => {
  try {
    return await withReplicationFallback(
      async () => {
        const armband = await replicatedArmbandsTable.lookupByArmbandNumber(showId, armbandNumber);
        if (!armband || !armband.dogId) return { data: null, error: null };

        const dog = await replicatedDogsTable.getDogById(armband.dogId);
        if (!dog) return { data: null, error: null };

        // people table is not replicated — owner always fetched from PostgREST
        let owner = { first_name: 'Unknown', last_name: '' };
        if (dog.ownerId) {
          const { data: ownerData } = await supabase
            .from('people')
            .select('first_name, last_name')
            .eq('id', dog.ownerId)
            .maybeSingle();
          if (ownerData) {
            owner = { first_name: ownerData.first_name, last_name: ownerData.last_name };
          }
        }

        const allEntries = await replicatedEntriesTable.getAll();
        const dogEntries = allEntries.filter(e => e.dogId === armband.dogId && e.showId === showId);

        const classIds = [...new Set(dogEntries.map(e => e.classId).filter(Boolean))] as string[];
        const classesMap = new Map<
          string,
          Awaited<ReturnType<typeof replicatedClassesTable.getClassById>>
        >();
        const classResults = await Promise.all(
          classIds.map(id => replicatedClassesTable.getClassById(id))
        );
        classIds.forEach((id, i) => {
          if (classResults[i]) classesMap.set(id, classResults[i]);
        });

        const result = mapArmbandLookup(armband, dog, owner, dogEntries, classesMap as never);
        return { data: result, error: null };
      },
      () => postgrestLookupDogByArmband(showId, armbandNumber),
      'armbands',
      'lookup_by_armband'
    );
  } catch (error) {
    return { data: null, error: error as DatabaseError };
  }
};
