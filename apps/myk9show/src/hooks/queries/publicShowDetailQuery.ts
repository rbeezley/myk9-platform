import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  GUEST_READ_QUERY_OPTIONS,
  resolveGuestRead,
  useQueryOnlineStatus,
} from '@/hooks/guestServerRead';
import { getPublicShowById } from '@/services/database/shows/publicShowDetail';
import { mapDatabaseToShow } from '@/services/mappers/showMappers';
import type { Show } from '@/types/show-types';

/**
 * MYK9-779/783: the one cache entry for "this show, as the server returns it to
 * a signed-out guest". /shows/:id (useFastShowDetails) and every guest-reachable
 * useShowQuery caller share it, so they dedupe into one request and can never
 * disagree about whether a guest may see the show.
 */
export const publicShowDetailQueryKey = (id: string) => ['shows', 'public-detail', id] as const;

/** anon's answer for one show: the mapped row, or null when anon may not see it. */
export async function fetchPublicShowDetail(id: string): Promise<Show | null> {
  const row = await getPublicShowById(id);
  return row ? mapDatabaseToShow(row as Parameters<typeof mapDatabaseToShow>[0]) : null;
}

/**
 * The guest half of `useShowQuery`, shaped like the member result so callers
 * need no guest branch of their own.
 *
 * INTENT: same owner decision as MYK9-747/768/779/780. A guest's show is never
 * the device replica (getShowById is replica-first and holds whatever an
 * earlier signed-in session could see: drafts, shows soft-deleted since). It is
 * read online every mount, and `data` is only what THIS mount's fetch returned
 * (resolveGuestRead): no cached copy while it runs, nothing offline, and
 * `undefined` when anon may not see the show.
 */
export function usePublicShowDetailQuery(id: string, enabled: boolean): UseQueryResult<Show> {
  const query = useQuery({
    queryKey: publicShowDetailQueryKey(id),
    queryFn: () => fetchPublicShowDetail(id),
    enabled,
    ...GUEST_READ_QUERY_OPTIONS,
  });
  const isOnline = useQueryOnlineStatus();
  if (!enabled) return query as UseQueryResult<Show>;

  const read = resolveGuestRead(query, isOnline);
  return {
    ...query,
    data: read.kind === 'ready' ? (read.data ?? undefined) : undefined,
    isPlaceholderData: false,
    isLoading: read.kind === 'loading',
    isError: read.kind === 'error',
  } as UseQueryResult<Show>;
}
