import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useShowStore } from '@/store/showStore';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { parsePublishBlockers, type PublishBlocker } from './publishBlockers';

/**
 * The one state model for every publish-blockers reader. `offline` wins (a failed call offline
 * is not a verdict), then `failed` (even when an older answer is cached: a failed refresh must
 * not read as clearance), then `checking`, then `ready`. Only `ready` carries lines, and only a
 * `ready` empty list means nothing blocks.
 */
export type PublishBlockersState =
  | { state: 'checking'; blockers: [] }
  | { state: 'offline'; blockers: [] }
  | { state: 'failed'; blockers: []; retry: () => void }
  | { state: 'ready'; blockers: PublishBlocker[] };

const READY_EMPTY: PublishBlockersState = { state: 'ready', blockers: [] };

/** Under ['shows', showId, ...] so a premium publish or any show refresh re-asks the server. */
export const showPublishBlockersQueryKey = (showId: string) =>
  ['shows', showId, 'publish-blockers'] as const;

/**
 * The local show fields the server's list depends on. They sit in the query key, so any local
 * change (a date edit, the "we publish our own premium" switch, a premium publish) asks the
 * server again, and so does the change that arrives once a replicated write has synced.
 */
function usePublishBlockerDeps(showId: string | undefined) {
  return useShowStore(state => {
    const show = state.shows.find(candidate => candidate.id === showId);
    return [
      show?.clubId ?? null,
      show?.status ?? null,
      show?.entryOpenDate ?? null,
      show?.entryCloseDate ?? null,
      show?.onlineEntriesEnabled ?? null,
      show?.publishesOwnPremium ?? null,
      show?.publishedPremiumUrl ?? null,
      show?.publishedPremiumAt ?? null,
    ].join('|');
  });
}

export const clubPublishBlockersQueryKey = (clubId: string) =>
  ['clubs', clubId, 'publish-blockers'] as const;

/**
 * MYK9-2198: the show's publish blockers, exactly as public.show_publish_blockers returns them
 * (empty for a show that is already public). Online-only on purpose: publishing needs the server.
 * Offline or a failed call is its own state (`offline`, `failed`), never an empty list, because an empty list
 * reads as "ready to publish". `networkMode: 'always'` makes an offline call fail instead of
 * waiting forever as "loading".
 */
export function usePublishBlockers(
  showId: string | undefined,
  enabled = true
): PublishBlockersState {
  const online = useIsOnline();
  const deps = usePublishBlockerDeps(showId);
  const query = useQuery({
    queryKey: [...showPublishBlockersQueryKey(showId ?? ''), deps],
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
  return toState(query, online, Boolean(showId) && enabled);
}

/** The club's own lines (approval, payouts), for the wizard's Review step. */
export function useClubPublishBlockers(clubId: string | undefined): PublishBlockersState {
  const online = useIsOnline();
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
  return toState(query, online, Boolean(clubId));
}

/** `asked` is false when the caller does not need the list (no id, or not a draft): nothing blocks. */
function toState(
  query: { data: PublishBlocker[] | undefined; isError: boolean; refetch: () => unknown },
  online: boolean,
  asked: boolean
): PublishBlockersState {
  if (!asked) return READY_EMPTY;
  if (!online) return { state: 'offline', blockers: [] };
  if (query.isError) return { state: 'failed', blockers: [], retry: () => void query.refetch() };
  if (!query.data) return { state: 'checking', blockers: [] };
  return { state: 'ready', blockers: query.data };
}
