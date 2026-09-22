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
  excludedMutationIds?: readonly string[];
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

const rollbackByMutationId = new Map<
  string,
  { show: Show; style: ShowStyle; queryClient: QueryClient }
>();

type ShowCachePatch = {
  style: ShowStyle;
  _syncStatus: NonNullable<Show['_syncStatus']>;
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

function cachedStyleMatchesAny(
  queryClient: QueryClient,
  showId: string,
  expectedStyles: ReadonlySet<ShowStyle>
): boolean {
  const detail = queryClient.getQueryData<Show>(showQueryKeys.detail(showId));
  if (detail && detail.style && !expectedStyles.has(detail.style as ShowStyle)) return false;

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
    if (matching && (!('style' in matching) || !expectedStyles.has(matching.style as ShowStyle))) {
      return false;
    }
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
  if (mutationId) rollbackByMutationId.set(mutationId, { show, style, queryClient });

  const now = new Date();
  const patch = {
    style,
    _syncStatus: 'pending' as const,
    _lastModified: now,
  };

  patchExistingShowCaches(queryClient, show.id, patch);

  return { ...show, ...patch };
}

/** Reconcile replica and warm caches from the remaining show-style queue lineage. */
export async function reconcileShowStyleMutations({
  showId,
  excludedMutationIds = [],
  queryClient,
}: ReconcileFailedShowStyleInput): Promise<void> {
  const excluded = new Set(excludedMutationIds);
  const records = [...rollbackByMutationId.entries()].filter(
    ([, record]) => record.show.id === showId
  );
  const remainingRecords = records.filter(([mutationId]) => !excluded.has(mutationId));
  const fallbackRecord = remainingRecords.at(-1)?.[1] ?? records[0]?.[1];
  const fallbackShow = fallbackRecord?.show;
  const fallbackStyle = remainingRecords.at(-1)?.[1].style ?? records[0]?.[1].show.style;
  const expectedStyles = new Set<ShowStyle>(
    records
      .flatMap(([, record]) => [record.style, record.show.style as ShowStyle])
      .filter((style): style is ShowStyle => typeof style === 'string')
  );
  const restored = await replicatedShowsTable.reconcileShowStyleMutations(
    showId,
    excludedMutationIds
  );
  if (!restored && (!fallbackShow || !cachedStyleMatchesAny(queryClient, showId, expectedStyles))) {
    return;
  }
  const previousStyle = restored?.style ?? fallbackStyle;

  if (previousStyle) {
    patchExistingShowCaches(queryClient, showId, {
      style: previousStyle as ShowStyle,
      _syncStatus: restored?._syncStatus ?? (remainingRecords.length > 0 ? 'pending' : 'synced'),
      _lastModified: restored?._lastModified ?? fallbackShow?._lastModified ?? new Date(),
    });
  } else {
    await queryClient.invalidateQueries({ queryKey: showQueryKeys.detail(showId) });
    await queryClient.invalidateQueries({ queryKey: showQueryKeys.all });
  }
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

export function forgetShowStyleMutations(mutationIds: readonly string[]): void {
  for (const mutationId of mutationIds) rollbackByMutationId.delete(mutationId);
}
