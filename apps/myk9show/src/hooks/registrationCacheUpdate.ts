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

/**
 * THE invalidation rule for the registrations replica (MYK9-1071, review round
 * 3): whenever `dog_registrations` changes outside a queued write (a sync, a
 * conflict resolution, a discard), every query that shows registrations is
 * invalidated: the Registrations lists, the dog reads (roster, one dog) and the
 * owner's dogs. Queue-time writes patch through applyRegistrationCacheUpdate.
 */
export function invalidateRegistrationConsumers(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ['registrations'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
  void queryClient.invalidateQueries({
    predicate: query => query.queryKey[0] === 'users' && query.queryKey[2] === 'dogs',
  });
}

/**
 * Invalidate what a replicated table's change can show. Every provider path
 * that refreshes after a table changes goes through this, so the registration
 * readers (which do not use the table name as a query key) are never missed.
 */
export function invalidateTableConsumers(queryClient: QueryClient, tableName: string): void {
  void queryClient.invalidateQueries({ queryKey: [tableName] });
  if (tableName === 'dog_registrations') invalidateRegistrationConsumers(queryClient);
}

/**
 * A discarded registration INSERT never reaches the server, and the queue
 * removes its local-only row: drop it from the caches now (offline the
 * invalidation alone would pause and leave it on screen).
 */
export function dropDiscardedRegistrationInserts(
  queryClient: QueryClient,
  mutations: ReadonlyArray<{
    tableName: string;
    operation?: string;
    rowId?: string;
    data?: Record<string, unknown>;
  }>
): void {
  const remove = mutations
    .filter(m => m.tableName === 'dog_registrations' && m.operation === 'INSERT' && m.rowId)
    .flatMap(m =>
      typeof m.data?.dog_id === 'string' ? [{ id: String(m.rowId), dogId: m.data.dog_id }] : []
    );
  if (remove.length > 0) applyRegistrationCacheUpdate(queryClient, { remove });
  if (mutations.some(m => m.tableName === 'dog_registrations')) {
    invalidateRegistrationConsumers(queryClient);
  }
}
