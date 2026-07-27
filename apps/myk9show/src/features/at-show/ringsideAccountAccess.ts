import { UserRole, type UserWithRoles } from '@/types/auth-types';
import { hasScopedClubRole, hasScopedShowRole } from '@/utils/roleScopes';

export const RINGSIDE_STAFF_ROLES: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.JUDGE,
  UserRole.STEWARD,
];

export function hasRingsideStaffRole(hasRole: (role: UserRole) => boolean): boolean {
  return RINGSIDE_STAFF_ROLES.some(role => hasRole(role));
}

const RINGSIDE_SCOPED_STAFF_ROLES: readonly UserRole[] = [
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.CHAIRMAN,
  UserRole.STEWARD,
];

interface RingsideShowScope {
  id: string;
  clubId: string;
}

export function hasRingsideAccountShowAccess(
  userWithRoles: UserWithRoles | null | undefined,
  hasRole: (role: UserRole) => boolean,
  show: RingsideShowScope
): boolean {
  if (hasRole(UserRole.SITE_ADMIN)) return true;

  return RINGSIDE_SCOPED_STAFF_ROLES.some(
    role =>
      hasRole(role) &&
      (hasScopedShowRole(userWithRoles, role, show.id) ||
        hasScopedClubRole(userWithRoles, role, show.clubId))
  );
}
