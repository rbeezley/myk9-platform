import { useMemo } from 'react';
import { ScopeType, UserRole, type RoleScope } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';

export type ClubReadinessStatus = 'loading' | 'fresh' | 'offline' | 'unavailable';

export interface ClubSummary {
  id: string;
  name: string;
}

export type ValidatedClubContext =
  | { status: 'not-applicable' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'missing'; scopeIds: string[] }
  /**
   * More than one club is available and none is selected yet. A CHOICE, not an
   * error — see the note in selectValidatedClubContext.
   */
  | { status: 'choose'; clubs: ClubSummary[] }
  | { status: 'ready'; clubId: string; clubName: string };

export interface ValidatedClubContextInput {
  roles: UserRole[];
  scopes: Pick<RoleScope, 'roleId' | 'scopeType' | 'scopeId'>[];
  clubs: ClubSummary[];
  readiness: ClubReadinessStatus;
  /** The club the operator picked, when more than one is available. */
  selectedClubId?: string | null | undefined;
}

/**
 * Selects a club-admin destination only from a freshly validated live club.
 * Stale role scopes are deliberately ignored; they must never become links.
 *
 * MYK9-138. Two rules were wrong here, and they reinforced each other:
 *
 *  1. Only CLUB_ADMIN was considered, so a SITE ADMIN — who administers every
 *     club by definition — resolved to 'not-applicable' and could not open any
 *     club-scoped page without being granted a per-club club_admin row. The
 *     platform owner could not manage clubs on their own platform.
 *  2. Holding two clubs returned 'ambiguous', surfaced as "ask an administrator
 *     to correct the club access". Administering two clubs is ordinary, and for
 *     a site admin (who now sees ALL clubs) it is the normal case — so the old
 *     rule would have turned fix (1) into a permanent dead end.
 *
 * Hence 'choose': multiple candidates return the list so the caller can render
 * a switcher, and `selectedClubId` resolves it.
 */
export function selectValidatedClubContext({
  roles,
  scopes,
  clubs,
  readiness,
  selectedClubId,
}: ValidatedClubContextInput): ValidatedClubContext {
  const isSiteAdmin = roles.includes(UserRole.SITE_ADMIN);
  const isClubAdmin = roles.includes(UserRole.CLUB_ADMIN);
  if (!isSiteAdmin && !isClubAdmin) return { status: 'not-applicable' };

  if (readiness === 'loading') return { status: 'loading' };
  if (readiness !== 'fresh') return { status: 'unavailable' };

  const scopeIds = [
    ...new Set(
      scopes
        .filter(scope => scope.roleId === UserRole.CLUB_ADMIN && scope.scopeType === ScopeType.CLUB)
        .map(scope => scope.scopeId)
        .filter(Boolean)
    ),
  ];

  // A site admin administers every live club. Club-scoped rows still apply, so
  // an account holding both roles is never narrowed by its club_admin grants.
  const candidates = isSiteAdmin ? clubs : clubs.filter(club => scopeIds.includes(club.id));

  if (candidates.length === 0) {
    return { status: 'missing', scopeIds };
  }

  if (candidates.length === 1) {
    return { status: 'ready', clubId: candidates[0].id, clubName: candidates[0].name };
  }

  const selected = selectedClubId ? candidates.find(club => club.id === selectedClubId) : undefined;
  if (selected) {
    return { status: 'ready', clubId: selected.id, clubName: selected.name };
  }

  return { status: 'choose', clubs: candidates };
}

export function useValidatedClubContext(input: ValidatedClubContextInput): ValidatedClubContext {
  const { roles, scopes, clubs, readiness, selectedClubId } = input;
  return useMemo(
    () => selectValidatedClubContext({ roles, scopes, clubs, readiness, selectedClubId }),
    [roles, scopes, clubs, readiness, selectedClubId]
  );
}

export function useCurrentValidatedClubContext(): ValidatedClubContext {
  const { getUserRoles, userWithRoles } = useAuthContext();
  const roles = getUserRoles();
  const scopes = userWithRoles?.scopes ?? [];
  const clubs = useClubStore(state => state.clubs);
  const readiness = useClubStore(state => state.clubReadiness);
  const selectedClubId = useClubStore(state => state.selectedClubId);

  return useValidatedClubContext({ roles, scopes, clubs, readiness, selectedClubId });
}
