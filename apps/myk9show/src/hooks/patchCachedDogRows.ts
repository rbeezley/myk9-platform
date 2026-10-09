import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';

/**
 * Show a queued local dog edit in the cached dog reads immediately (MYK9-1070).
 *
 * The dog queries stay `networkMode: 'online'` on purpose: they are hybrid reads
 * (owners and registrations come from PostgREST), so an offline refetch would
 * replace cached owner/registration data with empty values. The invalidation that
 * follows a local write therefore pauses while offline and runs on reconnect; this
 * patch is what makes the edit visible in the meantime.
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
