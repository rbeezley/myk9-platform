import { useSyncExternalStore } from 'react';
import { useQueries } from '@tanstack/react-query';
import { classifyPreviewError } from './deleteErrors';
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
  /** The summed state the dialog renders. */
  state: DeletePreviewState;
  /** Per item, in target order; undefined until that item's counts arrive. */
  perItem: (DeletePreview | undefined)[];
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
 * - any item failing makes the whole dialog unavailable;
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

  const retry = () => {
    for (const query of queries) {
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
      retry,
    };
  }

  const failed = queries.find(query => query.isError);
  if (failed) {
    return {
      state: {
        status: 'unavailable',
        reason: classifyPreviewError(failed.error),
        isRetrying: queries.some(query => query.isFetching),
      },
      perItem,
      retry,
    };
  }

  if (ids.length === 0 || queries.some(query => query.isFetching || query.data === undefined)) {
    return { state: { status: 'pending' }, perItem, retry };
  }

  return {
    state: {
      status: 'ready',
      preview: sumPreviews(queries.map(query => query.data as DeletePreview)),
    },
    perItem,
    retry,
  };
}
