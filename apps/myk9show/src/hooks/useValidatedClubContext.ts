import { useMemo } from 'react';
import { ScopeType, UserRole, type RoleScope } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useClubStore } from '@/store/clubStore';

export type ClubReadinessStatus = 'loading' | 'fresh' | 'offline' | 'unavailable';

export type ValidatedClubContext =
  | { status: 'not-applicable' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'missing'; scopeIds: string[] }
  | { status: 'ambiguous'; scopeIds: string[] }
  | { status: 'ready'; clubId: string; clubName: string };

interface ClubSummary {
  id: string;
  name: string;
}

export interface ValidatedClubContextInput {
  roles: UserRole[];
  scopes: Pick<RoleScope, 'roleId' | 'scopeType' | 'scopeId'>[];
  clubs: ClubSummary[];
  readiness: ClubReadinessStatus;
}

/**
 * Selects a club-admin destination only from a freshly validated live club.
 * Stale role scopes are deliberately ignored; they must never become links.
 */
export function selectValidatedClubContext({
  roles,
  scopes,
  clubs,
  readiness,
}: ValidatedClubContextInput): ValidatedClubContext {
  if (!roles.includes(UserRole.CLUB_ADMIN)) return { status: 'not-applicable' };
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
  const liveClubs = clubs.filter(club => scopeIds.includes(club.id));

  if (liveClubs.length === 1) {
    return { status: 'ready', clubId: liveClubs[0].id, clubName: liveClubs[0].name };
  }
  if (liveClubs.length > 1) {
    return { status: 'ambiguous', scopeIds: liveClubs.map(club => club.id) };
  }
  return { status: 'missing', scopeIds };
}

export function useValidatedClubContext(input: ValidatedClubContextInput): ValidatedClubContext {
  const { roles, scopes, clubs, readiness } = input;
  return useMemo(
    () => selectValidatedClubContext({ roles, scopes, clubs, readiness }),
    [roles, scopes, clubs, readiness]
  );
}

export function useCurrentValidatedClubContext(): ValidatedClubContext {
  const { getUserRoles, userWithRoles } = useAuthContext();
  const roles = getUserRoles();
  const scopes = userWithRoles?.scopes ?? [];
  const clubs = useClubStore(state => state.clubs);
  const readiness = useClubStore(state => state.clubReadiness);

  return useValidatedClubContext({ roles, scopes, clubs, readiness });
}
