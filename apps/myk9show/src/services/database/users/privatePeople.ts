import { supabase } from '@/lib/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { normalizeJuniorHandlerNumbers } from '@/features/registries/juniorHandlerPolicy';

export interface PrivatePersonProfile {
  personId: string;
  dateOfBirth: string | null;
  juniorHandlerNumbers: Record<string, string> | undefined;
}

interface PrivatePeopleRow {
  person_id: string;
  date_of_birth: string | null;
  junior_handler_numbers: unknown;
}

function mapPrivateRow(row: PrivatePeopleRow): PrivatePersonProfile {
  return {
    personId: row.person_id,
    dateOfBirth: row.date_of_birth,
    juniorHandlerNumbers: normalizeJuniorHandlerNumbers(row.junior_handler_numbers),
  };
}

/**
 * Read only the private profiles the database authorizes for this caller. The
 * RPC scopes each person through self/site-admin or entry → managed show; an
 * unrelated manager therefore receives no row rather than a blank PII object.
 */
export async function loadPeoplePrivateProfiles(personIds: readonly string[]): Promise<{
  byPersonId: Map<string, PrivatePersonProfile>;
  readComplete: boolean;
  readError?: string;
}> {
  const ids = [...new Set(personIds.filter(Boolean))];
  if (ids.length === 0) return { byPersonId: new Map(), readComplete: true };

  const byPersonId = new Map<string, PrivatePersonProfile>();
  let readComplete = true;
  let readError: string | undefined;

  for (const batch of chunk(ids, ID_CHUNK_SIZE)) {
    try {
      const { data, error } = await supabase.rpc('get_people_private', {
        p_person_ids: batch,
      });
      if (error) {
        readComplete = false;
        readError ??= error.message;
        continue;
      }
      for (const row of data ?? []) byPersonId.set(row.person_id, mapPrivateRow(row));
    } catch (error) {
      readComplete = false;
      readError ??= error instanceof Error ? error.message : 'Private profile read failed';
    }
  }

  const missingIds = ids.filter(id => !byPersonId.has(id));
  if (missingIds.length > 0) {
    readComplete = false;
    readError ??= 'Private profile data was unavailable for one or more requested people';
  }

  return { byPersonId, readComplete, ...(readError ? { readError } : {}) };
}

/**
 * Apply public and explicitly-present private fields under one database
 * transaction. The RPC locks the person row before patching either relation,
 * so callers never need to read/merge/compensate private state in the browser.
 */
export async function updatePersonWithPrivateProfile(input: {
  personId: string;
  publicUpdates: Record<string, unknown>;
  privateUpdates: Record<string, unknown>;
}) {
  return supabase.rpc('update_person_with_private', {
    p_person_id: input.personId,
    p_public_updates: input.publicUpdates,
    p_private_updates: input.privateUpdates,
  });
}
