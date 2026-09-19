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

interface PrivateRpcError {
  message: string;
  code?: string;
}

interface PrivateRpcResult<T> {
  data: T | null;
  error: PrivateRpcError | null;
}

export interface AtomicPersonUpdateResult extends Record<string, unknown> {
  id: string;
  date_of_birth: string | null;
  junior_handler_numbers: unknown;
}

/**
 * The private table and RPCs land in Supabase before the generated schema types
 * can be refreshed. Keep this boundary local and typed by the migration contract;
 * do not add an invented people_private entry to database.types.ts.
 */
const privateRpc = supabase.rpc.bind(supabase) as unknown as <T>(
  functionName: string,
  args: Record<string, unknown>
) => Promise<PrivateRpcResult<T>>;

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
export async function loadPeoplePrivateProfiles(
  personIds: readonly string[]
): Promise<{ byPersonId: Map<string, PrivatePersonProfile>; readComplete: boolean }> {
  const ids = [...new Set(personIds.filter(Boolean))];
  if (ids.length === 0) return { byPersonId: new Map(), readComplete: true };

  const byPersonId = new Map<string, PrivatePersonProfile>();
  let readComplete = true;

  for (const batch of chunk(ids, ID_CHUNK_SIZE)) {
    try {
      const { data, error } = await privateRpc<PrivatePeopleRow[]>('get_people_private', {
        p_person_ids: batch,
      });
      if (error) {
        readComplete = false;
        continue;
      }
      for (const row of data ?? []) byPersonId.set(row.person_id, mapPrivateRow(row));
    } catch {
      readComplete = false;
    }
  }

  return { byPersonId, readComplete };
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
}): Promise<{ data: AtomicPersonUpdateResult | null; error: PrivateRpcError | null }> {
  const { data, error } = await privateRpc<AtomicPersonUpdateResult>('update_person_with_private', {
    p_person_id: input.personId,
    p_public_updates: input.publicUpdates,
    p_private_updates: input.privateUpdates,
  });

  return { data, error };
}
