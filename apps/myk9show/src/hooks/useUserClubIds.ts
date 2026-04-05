/**
 * useUserClubIds — returns the set of club IDs the current user has
 * secretary or club-admin access to.
 *
 * Returns `null` when the user is a platform admin (unrestricted access).
 * Returns a non-null Set (possibly empty) for all other users.
 */
import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { ScopeType, UserRole } from '@/types/auth-types';

export function useUserClubIds(): Set<string> | null {
  const { userWithRoles } = useAuthContext();

  return useMemo(() => {
    const isPlatformAdmin = userWithRoles?.roles?.includes(UserRole.SITE_ADMIN) ?? false;
    if (isPlatformAdmin) return null; // null = unrestricted

    const ids = new Set<string>();
    for (const scope of userWithRoles?.scopes ?? []) {
      if (
        scope.scopeType === ScopeType.CLUB &&
        (scope.roleId === UserRole.SECRETARY || scope.roleId === UserRole.CLUB_ADMIN)
      ) {
        ids.add(scope.scopeId);
      }
    }
    return ids.size > 0 ? ids : null;
  }, [userWithRoles?.roles, userWithRoles?.scopes]);
}
