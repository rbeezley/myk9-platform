// Armband-related database queries
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';

/**
 * Get the count of armbands assigned for a given show.
 */
export const getArmbandCountForShow = async (showId: string) => {
  const startTime = Date.now();

  try {
    const { count, error } = await supabase
      .from('armbands')
      .select('id', { count: 'exact', head: true })
      .eq('show_id', showId);

    const duration = Date.now() - startTime;
    logQuery('armbands', 'count_for_show', duration, error?.message);

    if (error) {
      return {
        count: 0,
        error: createDatabaseError(error, 'armbands', 'count_for_show'),
      };
    }

    return { count: count ?? 0, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    logQuery('armbands', 'count_for_show', duration, String(error));
    return {
      count: 0,
      error: createDatabaseError(error, 'armbands', 'count_for_show'),
    };
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
      return { armband: String(data), error: null };
    }
    return { armband: null, error: error ?? null };
  } catch (error) {
    return { armband: null, error };
  }
};

/**
 * Look up a dog by armband number within a show.
 * Returns dog info, owner, and all entries for that dog in the show.
 */
export const lookupDogByArmband = async (showId: string, armbandNumber: string) => {
  const startTime = Date.now();

  try {
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

    const armbandDuration = Date.now() - startTime;
    logQuery('armbands', 'lookup_by_armband', armbandDuration, armbandError?.message);

    if (armbandError) {
      return {
        data: null,
        error: createDatabaseError(armbandError, 'armbands', 'lookup_by_armband'),
      };
    }

    if (!armbandData) {
      return { data: null, error: null };
    }

    // Cast the join results since the query builder returns generic types
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
    const entryStartTime = Date.now();
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

    const entryDuration = Date.now() - entryStartTime;
    logQuery('entries', 'lookup_entries_for_dog', entryDuration, entriesError?.message);

    if (entriesError) {
      return {
        data: null,
        error: createDatabaseError(entriesError, 'entries', 'lookup_entries_for_dog'),
      };
    }

    // Map entries to extract class_name and class_level from the joined class object
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

    const result = {
      armband_number: armbandData.armband_number,
      dog: {
        id: dog.id,
        name: dog.name,
        breed: dog.breed,
        sex: dog.sex,
      },
      owner,
      entries,
    };

    return { data: result, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    logQuery('armbands', 'lookup_by_armband', duration, String(error));
    return {
      data: null,
      error: createDatabaseError(error, 'armbands', 'lookup_by_armband'),
    };
  }
};
