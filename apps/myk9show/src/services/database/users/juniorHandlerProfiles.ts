import { supabase } from '@/lib/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { normalizeJuniorHandlerNumbers } from '@/features/registries/juniorHandlerPolicy';

/**
 * MYK9-570: the two junior handler columns for a set of handlers.
 *
 * Why a separate read rather than a join: the report/catalog entry rows come
 * from the replication-backed scoped reads, and the replica carries
 * `entries.handler_id` but nothing from `people`. This mirrors
 * `loadDogRegistrations`, which hydrates the same rows with registration data
 * for exactly the same reason.
 *
 * Why it is allowed to be a direct PostgREST read in a report path: it is the
 * same class as the registration hydration beside it — paperwork enrichment,
 * not a core offline flow. It is also ANCILLARY: a failure marks the read
 * incomplete and the catalog prints without junior marks rather than refusing
 * to print. An unmarked junior is a nuisance; a blank roster on show day is not.
 */
export interface JuniorHandlerProfile {
  dateOfBirth: string | null;
  juniorHandlerNumbers: Record<string, string> | undefined;
}

export interface JuniorHandlerProfilesResult {
  byPersonId: Map<string, JuniorHandlerProfile>;
  /** False when any batch failed, so a caller can say "not marked" rather than "not junior". */
  readComplete: boolean;
}

export async function loadJuniorHandlerProfiles(
  personIds: readonly string[]
): Promise<JuniorHandlerProfilesResult> {
  const ids = [...new Set(personIds.filter(Boolean))];
  if (ids.length === 0) return { byPersonId: new Map(), readComplete: true };

  const byPersonId = new Map<string, JuniorHandlerProfile>();
  let readComplete = true;

  // Batched, not one `.in(...)`: the filter travels in the URL, and a secretary
  // printing a whole show's catalog sends hundreds of handler ids (MYK9-272).
  for (const batch of chunk(ids, ID_CHUNK_SIZE)) {
    try {
      const { data, error } = await supabase
        .from('people')
        .select('id, date_of_birth, junior_handler_numbers')
        .in('id', batch);
      if (error) {
        readComplete = false;
        continue;
      }
      for (const row of data ?? []) {
        byPersonId.set(row.id, {
          dateOfBirth: row.date_of_birth ?? null,
          juniorHandlerNumbers: normalizeJuniorHandlerNumbers(row.junior_handler_numbers),
        });
      }
    } catch {
      // Offline. Keep whatever the earlier batches returned and report partial.
      readComplete = false;
    }
  }

  return { byPersonId, readComplete };
}
