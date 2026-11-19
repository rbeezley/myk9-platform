import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { parsePublishBlockers, type PublishBlocker } from './publishBlockers';

/** What a hook below tells the list: still asking, could not ask, or the server's answer. */
export type PublishBlockersState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; blockers: PublishBlocker[] };

/** Under ['shows', showId, ...] so a premium publish or any show refresh re-asks the server. */
export const showPublishBlockersQueryKey = (showId: string) =>
  ['shows', showId, 'publish-blockers'] as const;

export const clubPublishBlockersQueryKey = (clubId: string) =>
  ['clubs', clubId, 'publish-blockers'] as const;

/**
 * MYK9-2198: the show's publish blockers, exactly as public.show_publish_blockers returns them
 * (empty for a show that is already public). Online-only on purpose: publishing needs the server.
 * Offline or a failed call is its own `error` state, never an empty list, because an empty list
 * reads as "ready to publish". `networkMode: 'always'` makes an offline call fail instead of
 * waiting forever as "loading".
 */
export function usePublishBlockers(
  showId: string | undefined,
  enabled = true
): PublishBlockersState {
  const query = useQuery({
    queryKey: showPublishBlockersQueryKey(showId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('show_publish_blockers', {
        p_show_id: showId as string,
      });
      if (error) throw error;
      return parsePublishBlockers(data);
    },
    enabled: Boolean(showId) && enabled,
    networkMode: 'always',
    retry: false,
    staleTime: 0,
  });
  return toState(query);
}

/** The club's own lines (approval, payouts), for the wizard's Review step. */
export function useClubPublishBlockers(clubId: string | undefined): PublishBlockersState {
  const query = useQuery({
    queryKey: clubPublishBlockersQueryKey(clubId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('club_publish_blockers', {
        p_club_id: clubId as string,
      });
      if (error) throw error;
      return parsePublishBlockers(data);
    },
    enabled: Boolean(clubId),
    networkMode: 'always',
    retry: false,
    staleTime: 0,
  });
  return toState(query);
}

function toState(query: {
  data: PublishBlocker[] | undefined;
  isError: boolean;
  refetch: () => unknown;
}): PublishBlockersState {
  if (query.data) return { status: 'ready', blockers: query.data };
  if (query.isError) return { status: 'error', retry: () => void query.refetch() };
  return { status: 'loading' };
}
