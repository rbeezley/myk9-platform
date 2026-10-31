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
  args: { p_show_id: string }
) => Promise<{ data: ShowDogLimitedRow[] | null; error: unknown }>;

export function useAtShowExhibitorDogs(showId: string | undefined): UseAtShowStaffDogsResult {
  const query = useQuery({
    queryKey: ['at-show', 'exhibitor-dogs', showId],
    queryFn: async () => {
      const rpc = supabase.rpc.bind(supabase) as unknown as LimitedViewRpc;
      const { data, error } = await rpc('show_dogs_limited_view', { p_show_id: showId as string });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!showId,
    // Offline must fail fast into the "needs a connection" state, not pause forever.
    networkMode: 'always',
    staleTime: 30_000,
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
