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
  shows: readonly ClubShow[]
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
  for (const clubId of clubIds) {
    const clubShows = shows.filter(s => s.clubId === clubId);
    if (clubShows.some(s => isPublicShowStatus(s.status))) continue;
    return { clubId, draftShowId: clubShows.find(s => s.status === 'draft')?.id };
  }
  return null;
}
