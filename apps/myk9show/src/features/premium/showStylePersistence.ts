import type { QueryClient } from '@tanstack/react-query';
import type { Show } from '@/types/show-types';
import type { ShowStyle } from '@/features/registries';
import { showQueryKeys } from '@/hooks/queries/useShowsDatabase';
import { replicatedShowsTable } from '@/services/replication';

interface SaveShowDraftStyleInput {
  show: Show;
  style: ShowStyle;
  queryClient: QueryClient;
}

interface ReconcileFailedShowStyleInput {
  showId: string;
  attemptedStyle: ShowStyle;
  mutationId?: string;
  queryClient: QueryClient;
}

const SHOW_COLLECTION_SEGMENTS = new Set([
  'list',
  'search',
  'club',
  'status',
  'upcoming',
  'dateRange',
  'withEntryCounts',
  'deleted',
  'public',
]);

const rollbackByMutationId = new Map<string, { show: Show; queryClient: QueryClient }>();

type ShowCachePatch = {
  style: ShowStyle;
  _syncStatus: 'pending' | 'synced';
  _lastModified: Date;
};

function patchExistingShowCaches(
  queryClient: QueryClient,
  showId: string,
  patch: ShowCachePatch
): void {
  const detailKey = showQueryKeys.detail(showId);
  if (queryClient.getQueryData(detailKey) !== undefined) {
    queryClient.setQueryData<Show>(detailKey, current =>
      current ? { ...current, ...patch } : current
    );
  }

  for (const [queryKey, current] of queryClient.getQueriesData<unknown>({
    predicate: query => {
      const [root, segment] = query.queryKey;
      return (
        root === showQueryKeys.all[0] &&
        typeof segment === 'string' &&
        SHOW_COLLECTION_SEGMENTS.has(segment)
      );
    },
  })) {
    if (!Array.isArray(current)) continue;
    const matchingIndex = current.findIndex(
      item => item && typeof item === 'object' && 'id' in item && item.id === showId
    );
    if (matchingIndex < 0) continue;
    queryClient.setQueryData(
      queryKey,
      current.map((item, index) => (index === matchingIndex ? { ...item, ...patch } : item))
    );
  }
}

function cachedStyleStillMatches(
  queryClient: QueryClient,
  showId: string,
  attemptedStyle: ShowStyle
): boolean {
  const detail = queryClient.getQueryData<Show>(showQueryKeys.detail(showId));
  if (detail && detail.style !== attemptedStyle) return false;

  for (const [, current] of queryClient.getQueriesData<unknown>({
    predicate: query => {
      const [root, segment] = query.queryKey;
      return (
        root === showQueryKeys.all[0] &&
        typeof segment === 'string' &&
        SHOW_COLLECTION_SEGMENTS.has(segment)
      );
    },
  })) {
    if (!Array.isArray(current)) continue;
    const matching = current.find(
      item => item && typeof item === 'object' && 'id' in item && item.id === showId
    );
    if (matching && (!('style' in matching) || matching.style !== attemptedStyle)) return false;
  }

  return true;
}

/** Save a draft style through replication and patch every warm show cache. */
export async function saveShowDraftStyle({
  show,
  style,
  queryClient,
}: SaveShowDraftStyleInput): Promise<Show> {
  await queryClient.cancelQueries({ queryKey: showQueryKeys.all });
  const mutationId = await replicatedShowsTable.updateShowStyle(show.id, style);
  if (mutationId) rollbackByMutationId.set(mutationId, { show, queryClient });

  const now = new Date();
  const patch = {
    style,
    _syncStatus: 'pending' as const,
    _lastModified: now,
  };

  patchExistingShowCaches(queryClient, show.id, patch);

  return { ...show, ...patch };
}

/** Reconcile a permanent server rejection with the clean replica/cache state. */
export async function reconcileFailedShowStyle({
  showId,
  attemptedStyle,
  mutationId,
  queryClient,
}: ReconcileFailedShowStyleInput): Promise<void> {
  const restored = await replicatedShowsTable.revertFailedStyleMutation(showId, attemptedStyle);
  const rollback = mutationId ? rollbackByMutationId.get(mutationId) : undefined;
  const fallbackShow = rollback?.show;
  if (!restored && !cachedStyleStillMatches(queryClient, showId, attemptedStyle)) {
    if (mutationId) rollbackByMutationId.delete(mutationId);
    return;
  }
  const previousStyle = restored?.style ?? fallbackShow?.style;

  if (previousStyle) {
    patchExistingShowCaches(queryClient, showId, {
      style: previousStyle as ShowStyle,
      _syncStatus: 'synced',
      _lastModified: restored?._lastModified ?? fallbackShow?._lastModified ?? new Date(),
    });
  } else {
    await queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) });
    await queryClient.invalidateQueries({ queryKey: showQueryKeys.all });
  }

  if (mutationId) rollbackByMutationId.delete(mutationId);
}

/** Clear the exact rollback record when the upload event carries queue identity. */
export function forgetSuccessfulShowStyleMutation(mutationId: string): void {
  rollbackByMutationId.delete(mutationId);
}

export function forgetSuccessfulShowStyleForShow(showId: string): void {
  for (const [mutationId, rollback] of rollbackByMutationId) {
    if (rollback.show.id === showId) rollbackByMutationId.delete(mutationId);
  }
}
