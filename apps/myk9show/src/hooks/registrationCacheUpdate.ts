import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import {
  normalizeDogRegistrationNumber,
  normalizeDogRegistrationOrganization,
} from '@/utils/dogIdentity';

/**
 * The ONE cache update for every registration write (MYK9-1071): a queued add,
 * a queued edit, and the re-pull of a refused one.
 *
 * Registrations are shown from two kinds of cache: the dog's Registrations list
 * (`registrationsByDog`) and every dog read that embeds them (the roster, the
 * owner's dogs, one dog; each a dog row carrying a `registrations` array). The
 * dog reads are `networkMode: 'online'`, so offline their invalidation pauses;
 * without a patch, the entry wizard's class step still sees the dog with no
 * registration it just added.
 *
 * Rows are MERGED into what each cache already holds, never substituted: an
 * upsert replaces the row with the same id (or is dropped when the cache already
 * holds the same registry identity under another id, a create-RPC mirror),
 * otherwise it is appended; a removal drops that id. Nothing a cache held is
 * lost when the server read behind it failed. The caches are invalidated after,
 * so they refresh from the server when it can answer.
 */
export interface RegistrationCacheUpdate {
  /** snake_case registration rows; each must carry `dog_id`. */
  upsert?: Record<string, unknown>[];
  /** Rows to drop from the caches. */
  remove?: Array<{ id: string; dogId: string }>;
}

const identity = (row: Record<string, unknown>) =>
  `${normalizeDogRegistrationOrganization(row.organization as string | null)}|${normalizeDogRegistrationNumber(row.registration_number as string | null)}`;

export function mergeRegistrationRows(
  existing: readonly Record<string, unknown>[],
  upsert: readonly Record<string, unknown>[],
  removeIds: ReadonlySet<string>
): Record<string, unknown>[] {
  const merged = existing.filter(row => !removeIds.has(String(row.id)));
  for (const row of upsert) {
    const sameId = merged.findIndex(current => current.id === row.id);
    if (sameId >= 0) {
      merged[sameId] = { ...merged[sameId], ...row };
    } else if (!merged.some(current => identity(current) === identity(row))) {
      merged.push(row);
    }
  }
  return merged;
}

export function applyRegistrationCacheUpdate(
  queryClient: QueryClient,
  { upsert = [], remove = [] }: RegistrationCacheUpdate
): void {
  const dogIds = new Set([
    ...upsert.map(row => String(row.dog_id)),
    ...remove.map(entry => entry.dogId),
  ]);

  for (const dogId of dogIds) {
    const rows = upsert.filter(row => String(row.dog_id) === dogId);
    const removeIds = new Set(remove.filter(e => e.dogId === dogId).map(e => e.id));
    const merge = (existing: readonly Record<string, unknown>[]) =>
      mergeRegistrationRows(existing, rows, removeIds);

    queryClient.setQueryData(queryKeys.registrationsByDog(dogId), (old: unknown) =>
      Array.isArray(old) ? merge(old) : old === undefined ? merge([]) : old
    );

    const patchDog = (dog: unknown): unknown => {
      if (!dog || typeof dog !== 'object') return dog;
      const record = dog as Record<string, unknown>;
      if (record.id !== dogId || !Array.isArray(record.registrations)) return dog;
      return { ...record, registrations: merge(record.registrations) };
    };
    // ['dogs', ...] holds the roster and one dog; ['users', id, 'dogs'] the owner's dogs.
    queryClient.setQueriesData(
      { predicate: query => query.queryKey[0] === 'dogs' || query.queryKey[0] === 'users' },
      (old: unknown) => (Array.isArray(old) ? old.map(patchDog) : patchDog(old))
    );

    queryClient.invalidateQueries({ queryKey: queryKeys.registrationsByDog(dogId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dogRegistrations(dogId) });
  }
  if (dogIds.size > 0) queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
}

/**
 * After a queued add or edit: merge the dog's UNSENT rows (the write just made,
 * plus any earlier unsent ones) into the caches.
 */
export async function applyUnsentRegistrations(
  queryClient: QueryClient,
  dogId: string
): Promise<void> {
  const upsert = await replicatedDogRegistrationsTable.getRegistrationsForDog(dogId);
  applyRegistrationCacheUpdate(queryClient, { upsert });
}
