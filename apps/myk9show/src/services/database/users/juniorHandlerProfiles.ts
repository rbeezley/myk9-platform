import { supabase } from '@/lib/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { loadPeoplePrivateProfiles } from './privatePeople';

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
  /** The person's own name, used to check they are the handler the paperwork prints. */
  firstName: string | null;
  lastName: string | null;
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

  const [{ byPersonId: privateProfiles, readComplete }, namesResult] = await Promise.all([
    loadPeoplePrivateProfiles(ids),
    loadPeopleNames(ids),
  ]);
  const byPersonId = new Map<string, JuniorHandlerProfile>();

  // The private RPC intentionally returns only private fields. Names remain a
  // directory concern and are already present on the entry/report rows when
  // paperwork is assembled; no broad people read is needed here.
  for (const [personId, profile] of privateProfiles) {
    const name = namesResult.byPersonId.get(personId);
    byPersonId.set(personId, {
      firstName: name?.firstName ?? null,
      lastName: name?.lastName ?? null,
      dateOfBirth: profile.dateOfBirth,
      juniorHandlerNumbers: profile.juniorHandlerNumbers,
    });
  }

  return { byPersonId, readComplete: readComplete && namesResult.readComplete };
}

async function loadPeopleNames(personIds: readonly string[]): Promise<{
  byPersonId: Map<string, { firstName: string | null; lastName: string | null }>;
  readComplete: boolean;
}> {
  const byPersonId = new Map<string, { firstName: string | null; lastName: string | null }>();
  let readComplete = true;

  for (const batch of chunk(personIds, ID_CHUNK_SIZE)) {
    try {
      const { data, error } = await supabase
        .from('people')
        .select('id, first_name, last_name')
        .in('id', batch);
      if (error) {
        readComplete = false;
        continue;
      }
      for (const row of data ?? []) {
        byPersonId.set(row.id, {
          firstName: row.first_name ?? null,
          lastName: row.last_name ?? null,
        });
      }
    } catch {
      readComplete = false;
    }
  }

  return { byPersonId, readComplete };
}
