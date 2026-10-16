import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

/**
 * Show a queued local dog edit in the cached dog reads immediately (MYK9-1070).
 *
 * The dog reads (`useDogsQuery`, `useDogQuery`, `useDogsByOwnerQuery`) are
 * `networkMode: 'offlineFirst'`: they go to the server first and fall back to the
 * device replica when the server cannot be reached, so the invalidation that
 * follows a local write refetches offline too. This patch only puts the queued
 * edit on screen immediately, before that refetch settles. It is not what makes
 * an offline edit visible, and the Discard path does not use it: Discard
 * refetches (`useDiscardRevertCacheSync`) rather than patching rows.
 *
 * Only the changed dog's own columns (snake_case DB-row keys, e.g. `status`) are
 * merged; joined fields (`owner`, `registrations`) and every other dog are left
 * as they are. Cached values that are not a dog row or an array of rows are
 * returned untouched.
 */
export function patchCachedDogRows(
  queryClient: QueryClient,
  dogId: string,
  ownerId: string | undefined,
  fields: Record<string, unknown>
): void {
  const patchRow = (row: unknown): unknown =>
    row && typeof row === 'object' && (row as { id?: unknown }).id === dogId
      ? { ...(row as Record<string, unknown>), ...fields }
      : row;
  const updater = (old: unknown): unknown => {
    if (Array.isArray(old)) return old.map(patchRow);
    return patchRow(old);
  };

  // ['dogs'] covers the roster and dog(id); personDogs lives under ['users', id, 'dogs'].
  queryClient.setQueriesData({ queryKey: queryKeys.dogs }, updater);
  if (ownerId) queryClient.setQueriesData({ queryKey: queryKeys.personDogs(ownerId) }, updater);
}
