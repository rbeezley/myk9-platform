/**
 * MYK9-887 / MYK9-890: the one hook answering "can this user create a show for this club?"
 * for both the wizard's advisory alert and the club page's Add Show gating.
 *
 * `unknown` (no alert, Add Show not hidden) while the club row still has queued local
 * mutations: a club created offline-first only reaches the server, and the trigger that makes
 * its creator club_admin only fires, when the queue drains. When the queue drains the existing
 * `refreshPermissions()` runs exactly once, and the answer stays `unknown` until it resolves.
 * The queue read is owner-scoped by the mutation manager; nothing here is module-global.
 */
import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { mutationManager } from '@/services/replication/sharedMutationManager';
import { canCreateShowForClub } from './clubPermissions';

export type ClubShowCreateAccess = 'allowed' | 'denied' | 'unknown';

const PENDING_POLL_MS = 1500;

export function useClubShowCreateAccess(clubId: string | undefined): ClubShowCreateAccess {
  const { userWithRoles, refreshPermissions } = useAuthContext();
  const userId = userWithRoles?.id;
  const wasPendingRef = useRef(false);

  const pending = useQuery({
    queryKey: ['club-show-create-access', userId, clubId],
    enabled: Boolean(userId && clubId),
    // Polls only while rows are queued; the drain itself is the trigger to re-read scopes.
    refetchInterval: query => (query.state.data ? PENDING_POLL_MS : false),
    queryFn: async (): Promise<boolean> => {
      let isPending = false;
      try {
        isPending = (await mutationManager.getPendingMutationsForRow('clubs', clubId!)).length > 0;
      } catch {
        isPending = false; // no signed-in owner or queue unreadable: nothing to wait for
      }
      if (wasPendingRef.current && !isPending) {
        wasPendingRef.current = false;
        try {
          await refreshPermissions();
        } catch {
          // A failed refresh leaves scopes as they were; the RPC still decides.
        }
        return false;
      }
      wasPendingRef.current = isPending;
      return isPending;
    },
  });

  if (!userWithRoles || !clubId) return 'denied';
  if (canCreateShowForClub(userWithRoles, clubId)) return 'allowed';
  return pending.data === false ? 'denied' : 'unknown';
}
