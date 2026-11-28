import { useQuery } from '@tanstack/react-query';
import {
  getDeclinedRequestClubIds,
  getPendingClubAccessRequests,
} from '@/services/database/club-access-requests';
import { DECLINED_REQUESTS_KEY, WAITING_REQUESTS_KEY } from '@/pages/admin/useWaitingClubs';

/**
 * MYK9-2528: a club kept after its request was declined stays unauthorized but is not waiting
 * for anyone, so the club page must not say it is, or offer Approve in Onboarding (which no
 * longer lists it). Declined unless a newer pending request exists, the same rule as
 * `buildWaitingClubRows`. Shares the waiting list's query keys. Online-only; a failed or
 * unfinished read is "not declined", so the page keeps its ordinary unauthorized wording.
 */
export function useClubRequestDeclined(clubId: string | undefined, enabled: boolean): boolean {
  const active = enabled && Boolean(clubId);
  const declined = useQuery({
    queryKey: DECLINED_REQUESTS_KEY,
    queryFn: getDeclinedRequestClubIds,
    enabled: active,
  });
  const pending = useQuery({
    queryKey: WAITING_REQUESTS_KEY,
    queryFn: getPendingClubAccessRequests,
    enabled: active,
  });
  if (!active || !clubId || !declined.data || !pending.data) return false;
  const hasPending = pending.data.some(
    request => request.status === 'pending' && request.createdClubId === clubId
  );
  return declined.data.includes(clubId) && !hasPending;
}
