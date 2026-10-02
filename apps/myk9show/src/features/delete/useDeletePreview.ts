import { useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import { classifyPreviewError, isAlreadyGoneError } from './deleteErrors';
import { fetchDeletePreview, sumPreviews } from './deletePreview';
import type { DeleteObjectKind, DeletePreview, DeletePreviewState } from './deleteTypes';

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/**
 * The browser's own online flag. Read directly rather than through
 * `useNetworkStatus`, which requires its provider: the delete dialog is mounted
 * from many surfaces, and a missing provider must not crash a delete.
 */
export function useBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true
  );
}

export const deletePreviewKey = (kind: DeleteObjectKind, id: string) =>
  ['delete-preview', kind, id] as const;

export interface DeletePreviewResult {
  /** The summed state over the items that still exist. */
  state: DeletePreviewState;
  /** Per item, in target order; undefined until that item's counts arrive (and for a gone item). */
  perItem: (DeletePreview | undefined)[];
  /**
   * Items the server says are already gone (P0002: missing or already deleted,
   * e.g. another device deleted them). They are not part of `state`: a stale
   * item drops out of the delete instead of blocking the rest.
   */
  goneIds: string[];
  retry: () => void;
}

/**
 * Reads `delete_preview` for every item while the dialog is open.
 *
 * Every rule here keeps "unknown" from reading as "nothing blocks":
 * - offline: no read is made, and the state says so;
 * - any item still loading, or re-fetching over an older answer, is pending
 *   (React Query keeps the previous open's `data` through a refetch; a number
 *   with a fetch in flight over it is not a fact about now, MYK9-600);
 * - an item the server reports as already gone (P0002) is not a failure: it is
 *   listed in `goneIds` and left out of the summed state;
 * - any other item failing makes the whole dialog unavailable;
 * - `gcTime: 0` so a closed dialog does not leave counts behind for the next.
 */
export function useDeletePreview(
  kind: DeleteObjectKind,
  ids: readonly string[],
  enabled: boolean
): DeletePreviewResult {
  const isOnline = useBrowserOnline();
  const active = enabled && isOnline;

  const queries = useQueries({
    queries: ids.map(id => ({
      queryKey: deletePreviewKey(kind, id),
      queryFn: () => fetchDeletePreview(kind, id),
      enabled: active,
      retry: false,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: false,
    })),
  });

  const isGone = (query: (typeof queries)[number]) =>
    query.isError && !query.isFetching && isAlreadyGoneError(query.error);
  const goneIds = ids.filter((_, index) => {
    const query = queries[index];
    return query !== undefined && isGone(query);
  });
  const live = queries.filter(query => !isGone(query));

  const retry = () => {
    for (const query of live) {
      if (query.isError) void query.refetch();
    }
  };

  const perItem = queries.map(query =>
    query.isFetching || query.isError ? undefined : query.data
  );

  if (!isOnline) {
    return {
      state: { status: 'unavailable', reason: 'offline', isRetrying: false },
      perItem,
      goneIds: [],
      retry,
    };
  }

  const failed = live.find(query => query.isError);
  if (failed) {
    return {
      state: {
        status: 'unavailable',
        reason: classifyPreviewError(failed.error),
        isRetrying: live.some(query => query.isFetching),
      },
      perItem,
      goneIds,
      retry,
    };
  }

  if (ids.length === 0 || live.some(query => query.isFetching || query.data === undefined)) {
    return { state: { status: 'pending' }, perItem, goneIds, retry };
  }

  return {
    state: {
      status: 'ready',
      preview: sumPreviews(live.map(query => query.data as DeletePreview)),
    },
    perItem,
    goneIds,
    retry,
  };
}
