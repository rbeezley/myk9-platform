import { useQuery } from '@tanstack/react-query';
import { getClubAdmins, getClubShowManagers } from '@/services/database/club-memberships';
import { queryKeys } from '@/lib/queryClient';

export interface ClubOfficials {
  adminNames: string[];
  secretaryNames: string[];
}

function toNames(names: (string | null)[]): string[] {
  return names.filter((name): name is string => Boolean(name));
}

/**
 * Club admin(s) and secretary(ies) for the club header (MYK9-860).
 *
 * Admins come from a direct `user_roles` read, which RLS scopes to the
 * caller's own row or a site admin (see admins.ts) — no policy change.
 * Secretaries come from the existing `get_club_show_managers` RPC, which
 * already permits a broader set of callers (site admin, or this club's own
 * admin/secretary) via its own internal check. Either read returning
 * unauthorized (RLS row-filtering, or the RPC's 42501) is not an error for
 * this display — it just means this viewer sees no names for that group.
 */
async function fetchClubOfficials(clubId: string): Promise<ClubOfficials> {
  const [admins, secretaries] = await Promise.all([
    getClubAdmins(clubId).catch(() => []),
    getClubShowManagers(clubId).catch(() => []),
  ]);

  return {
    adminNames: toNames(admins.map(admin => admin.personName)),
    secretaryNames: toNames(secretaries.map(manager => manager.personName)),
  };
}

export function useClubOfficials(clubId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.clubOfficials(clubId),
    queryFn: () => fetchClubOfficials(clubId as string),
    enabled: Boolean(clubId),
    staleTime: 60_000,
  });
}
