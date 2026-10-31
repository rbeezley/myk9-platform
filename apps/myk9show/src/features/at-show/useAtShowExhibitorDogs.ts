import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { buildExhibitorDogs, type ShowDogLimitedRow } from './exhibitorDogIndex';
import type { UseAtShowStaffDogsResult } from './useAtShowStaffDogs';

/**
 * The show's dogs for an exhibitor (MYK9-1517): an online-only read of
 * `show_dogs_limited_view`, a server function that returns only the approved
 * columns and nothing at all to a caller without an entry or passcode for the show.
 * Exhibitor RLS limits the replica to their own entries, so the replica cannot
 * serve this list; favorited dogs' alerts still work offline through the shared
 * favorites sync.
 *
 * `rpc` is narrowed structurally: the function is newer than the generated types.
 */
type LimitedViewRpc = (
  fn: 'show_dogs_limited_view',
  args: { p_show_id: string; p_offset: number; p_limit: number }
) => Promise<{ data: ShowDogLimitedRow[] | null; error: unknown }>;

/** The function returns at most this many rows per call (PostgREST's max_rows). */
const PAGE_SIZE = 1000;
/** A runaway guard: 50 pages is 50,000 class entries, far past any show. */
const MAX_PAGES = 50;
/** No realtime channel reaches an exhibitor's replica for other people's dogs, so poll. */
const REFRESH_MS = 30_000;

export function useAtShowExhibitorDogs(showId: string | undefined): UseAtShowStaffDogsResult {
  const query = useQuery({
    queryKey: ['at-show', 'exhibitor-dogs', showId],
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as LimitedViewRpc;
      // Page until a short page returns, so a big show is never silently truncated.
      const rows: ShowDogLimitedRow[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const { data, error } = await rpc('show_dogs_limited_view', {
          p_show_id: showId as string,
          p_offset: page * PAGE_SIZE,
          p_limit: PAGE_SIZE,
        });
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < PAGE_SIZE) return rows;
      }
      throw new Error('show_dogs_limited_view returned more pages than expected');
    },
    enabled: !!showId,
    // Offline must fail fast into the "needs a connection" state, not pause forever.
    networkMode: 'always',
    staleTime: REFRESH_MS,
    // Check-ins and run order change all day; keep an open page current.
    refetchInterval: REFRESH_MS,
    retry: false,
  });
  const dogs = useMemo(() => (query.data ? buildExhibitorDogs(query.data) : []), [query.data]);
  return {
    dogs,
    showName: '',
    isLoading: query.isLoading,
    isComplete: true,
    loadFailed: query.isError,
    onRetry: () => {
      void query.refetch();
    },
  };
}
