import { useQueries } from '@tanstack/react-query';
import { withTimeout } from '@myk9/core';
import { supabase } from '@/lib/supabase';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import { PUBLISH_BLOCKERS_DEADLINE_MS } from '@/features/publishing/usePublishBlockers';
import { ScopeType, UserRole, type RoleScope } from '@/types/auth-types';

/**
 * MYK9-2199: what the server says about a club's first show (club_first_show_state). Same
 * four states as the publish-blockers readers, so the card shows the same checking, offline and
 * failed lines: only `ready` carries an answer, and a failed or offline call is never "not published".
 */
export type FirstShowState =
  | { state: 'checking' }
  | { state: 'offline' }
  | { state: 'failed'; retry: () => void }
  | { state: 'ready'; publishedEver: boolean; draftShowId: string | null };

export const clubFirstShowStateQueryKey = (clubId: string) =>
  ['clubs', clubId, 'first-show-state'] as const;

interface FirstShowAnswer {
  publishedEver: boolean;
  draftShowId: string | null;
}

function parseFirstShowAnswer(data: unknown): FirstShowAnswer {
  const row = (data ?? {}) as { published_ever?: unknown; draft_show_id?: unknown };
  return {
    publishedEver: row.published_ever === true,
    draftShowId: typeof row.draft_show_id === 'string' ? row.draft_show_id : null,
  };
}

/** The clubs she runs (club admin or secretary), the one she just added first, then by id. */
export function firstShowCandidateClubIds(
  scopes: readonly Pick<RoleScope, 'scopeType' | 'scopeId' | 'roleId'>[] | undefined,
  preferClubId?: string | null
): string[] {
  const ids = [
    ...new Set(
      (scopes ?? [])
        .filter(
          s =>
            s.scopeType === ScopeType.CLUB &&
            (s.roleId === UserRole.CLUB_ADMIN || s.roleId === UserRole.SECRETARY)
        )
        .map(s => s.scopeId)
    ),
  ].sort();
  if (preferClubId && ids.includes(preferClubId)) {
    ids.splice(ids.indexOf(preferClubId), 1);
    ids.unshift(preferClubId);
  }
  return ids;
}

/**
 * The club whose first-show card the dashboard shows, or null. Reads ONLY club_first_show_state
 * (online-only; no local show list). A club whose first show was ever published is skipped
 * for good; a club still being checked holds the card back so it never flashes for an established
 * club. A club whose check is offline or failed gets the card with that state.
 */
export function useFirstShowClub(
  scopes: readonly Pick<RoleScope, 'scopeType' | 'scopeId' | 'roleId'>[] | undefined,
  preferClubId?: string | null
): { clubId: string; firstShow: FirstShowState } | null {
  const online = useIsOnline();
  const clubIds = firstShowCandidateClubIds(scopes, preferClubId);
  const queries = useQueries({
    queries: clubIds.map(clubId => ({
      queryKey: clubFirstShowStateQueryKey(clubId),
      queryFn: async () => {
        const { data, error } = await withTimeout(
          supabase.rpc('club_first_show_state', { p_club_id: clubId }),
          PUBLISH_BLOCKERS_DEADLINE_MS,
          'club_first_show_state'
        );
        if (error) throw error;
        return parseFirstShowAnswer(data);
      },
      networkMode: 'always' as const,
      retry: false,
      staleTime: 0,
    })),
  });

  for (const [index, clubId] of clubIds.entries()) {
    const query = queries[index]!;
    // An answer already in hand wins over a failed refresh: a club that published stays done.
    if (query.data?.publishedEver) continue;
    if (query.data) {
      return {
        clubId,
        firstShow: {
          state: 'ready',
          publishedEver: false,
          draftShowId: query.data.draftShowId,
        },
      };
    }
    if (!online) return { clubId, firstShow: { state: 'offline' } };
    if (query.isError) {
      return { clubId, firstShow: { state: 'failed', retry: () => void query.refetch() } };
    }
    return null; // still checking this club: show nothing yet
  }
  return null;
}
