import { useQuery } from '@tanstack/react-query';
import { getClubOfficials } from '@/services/database/club-memberships';
import { useAuthContext } from '@/hooks/useAuthContext';
import { queryKeys } from '@/lib/queryClient';

/**
 * Club admin(s) and secretary(ies) for the club header (MYK9-860). Guests and
 * anonymous ringside sessions are skipped: anon has no EXECUTE on the RPC, and an
 * anonymous session is never a member, so the answer is known to be empty.
 */
export function useClubOfficials(clubId: string | undefined) {
  const { user } = useAuthContext();
  const isSignedIn = Boolean(user) && user?.is_anonymous !== true;

  return useQuery({
    queryKey: queryKeys.clubOfficials(clubId),
    queryFn: () => getClubOfficials(clubId as string),
    enabled: Boolean(clubId) && isSignedIn,
    staleTime: 60_000,
  });
}
