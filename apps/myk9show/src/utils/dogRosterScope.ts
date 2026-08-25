import { UserRole } from '@/types/auth-types';

/** Roles whose dog roster is the full roster rather than the viewer's own dogs. */
export const ROLES_WITH_FULL_DOG_ROSTER: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.CLUB_ADMIN,
  UserRole.SECRETARY,
];

/** The canonical question shared by data fetching and roster presentation. */
export function rosterIsOwnDogsOnly(hasRole: (role: UserRole) => boolean): boolean {
  return !ROLES_WITH_FULL_DOG_ROSTER.some(role => hasRole(role));
}

/** Adapter for non-React callers that already have the user's role list. */
export function rosterIsOwnDogsOnlyForRoles(userRoles: readonly UserRole[]): boolean {
  return rosterIsOwnDogsOnly(role => userRoles.includes(role));
}
