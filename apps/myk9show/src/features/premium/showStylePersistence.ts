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

const SHOW_COLLECTION_SEGMENTS = new Set([
  'list',
  'search',
  'club',
  'status',
  'upcoming',
  'dateRange',
  'withEntryCounts',
  'deleted',
]);

/** Save a draft style through replication and patch every warm show cache. */
export async function saveShowDraftStyle({
  show,
  style,
  queryClient,
}: SaveShowDraftStyleInput): Promise<Show> {
  await replicatedShowsTable.updateShowStyle(show.id, style);

  const now = new Date();
  const patch = {
    style,
    _syncStatus: 'pending' as const,
    _lastModified: now,
  };

  const detailKey = showQueryKeys.detail(show.id);
  if (queryClient.getQueryData(detailKey) !== undefined) {
    queryClient.setQueryData<Show>(detailKey, current =>
      current ? { ...current, ...patch } : current
    );
  }

  queryClient.setQueriesData(
    {
      predicate: query => {
        const [root, segment] = query.queryKey;
        return (
          root === showQueryKeys.all[0] &&
          typeof segment === 'string' &&
          SHOW_COLLECTION_SEGMENTS.has(segment)
        );
      },
    },
    current => {
      if (!Array.isArray(current)) return current;
      return current.map(item => {
        if (!item || typeof item !== 'object' || !('id' in item) || item.id !== show.id) {
          return item;
        }
        return { ...item, ...patch };
      });
    }
  );

  return { ...show, ...patch };
}
