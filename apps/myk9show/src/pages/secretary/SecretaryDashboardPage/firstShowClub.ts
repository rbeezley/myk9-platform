import { isPublicShowStatus } from '@/features/payments/onlineEntryGate';
import { ScopeType, UserRole, type RoleScope } from '@/types/auth-types';

interface ClubShow {
  id: string;
  clubId: string;
  status: string;
}

/**
 * MYK9-2199: the club (and its draft, if any) that still needs its first show published, or null.
 * Only clubs she runs as club admin or secretary count; a club with any public show is done.
 */
export function findFirstShowClub(
  scopes: readonly Pick<RoleScope, 'scopeType' | 'scopeId' | 'roleId'>[] | undefined,
  shows: readonly ClubShow[],
  options: { preferClubId?: string | null; isDismissed?: (clubId: string) => boolean } = {}
): { clubId: string; draftShowId: string | undefined } | null {
  const clubIds = [
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
  // The club she just added comes first, but only if it is one she runs.
  const { preferClubId, isDismissed } = options;
  if (preferClubId && clubIds.includes(preferClubId)) {
    clubIds.splice(clubIds.indexOf(preferClubId), 1);
    clubIds.unshift(preferClubId);
  }
  for (const clubId of clubIds) {
    // A club that has ever published its first show never sees the card again.
    if (isDismissed?.(clubId)) continue;
    const clubShows = shows.filter(s => s.clubId === clubId);
    if (clubShows.some(s => isPublicShowStatus(s.status))) continue;
    return { clubId, draftShowId: clubShows.find(s => s.status === 'draft')?.id };
  }
  return null;
}
