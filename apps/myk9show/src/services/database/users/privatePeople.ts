import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/supabase';
import { chunk, ID_CHUNK_SIZE } from '@/utils/chunkIds';
import { normalizeJuniorHandlerNumbers } from '@/features/registries/juniorHandlerPolicy';

const PRIVATE_RPC_UNAVAILABLE_KEY = 'myk9:people-private-rpc-unavailable';
const PRIVATE_RPC_UNAVAILABLE_TTL_MS = 60_000;
const PRIVATE_RPC_UNAVAILABLE_MESSAGE =
  'Private profile data is unavailable until the database migration is applied';

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

function privateRpcUnavailable(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const markedAt = Number(window.sessionStorage.getItem(PRIVATE_RPC_UNAVAILABLE_KEY));
    if (!Number.isFinite(markedAt)) return false;
    if (Date.now() - markedAt < PRIVATE_RPC_UNAVAILABLE_TTL_MS) return true;
    window.sessionStorage.removeItem(PRIVATE_RPC_UNAVAILABLE_KEY);
  } catch {
    // Storage is optional; a private-read failure must remain fail-closed.
  }
  return false;
}

function rememberPrivateRpcUnavailable(): void {
  try {
    window.sessionStorage.setItem(PRIVATE_RPC_UNAVAILABLE_KEY, String(Date.now()));
  } catch {
    // Storage is optional; the current call still returns unavailable below.
  }
}

function clearPrivateRpcUnavailable(): void {
  try {
    window.sessionStorage.removeItem(PRIVATE_RPC_UNAVAILABLE_KEY);
  } catch {
    // Storage is optional.
  }
}

function isMissingPrivateRpc(error: { code?: string; status?: number; message?: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    error.status === 404 ||
    /(?:could not find|function .*get_people_private.*does not exist)/i.test(error.message ?? '')
  );
}

function unavailablePrivateProfiles(): {
  byPersonId: Map<string, PrivatePersonProfile>;
  readComplete: false;
  readError: string;
} {
  return {
    byPersonId: new Map(),
    readComplete: false,
    readError: PRIVATE_RPC_UNAVAILABLE_MESSAGE,
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
  if (privateRpcUnavailable()) return unavailablePrivateProfiles();

  const byPersonId = new Map<string, PrivatePersonProfile>();
  let readComplete = true;
  let readError: string | undefined;

  for (const batch of chunk(ids, ID_CHUNK_SIZE)) {
    try {
      const { data, error } = await supabase.rpc('get_people_private', {
        p_person_ids: batch,
      });
      if (error) {
        if (isMissingPrivateRpc(error)) {
          rememberPrivateRpcUnavailable();
          return unavailablePrivateProfiles();
        }
        readComplete = false;
        readError ??= error.message;
        continue;
      }
      clearPrivateRpcUnavailable();
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
    p_public_updates: input.publicUpdates as Json,
    p_private_updates: input.privateUpdates as Json,
  });
}
