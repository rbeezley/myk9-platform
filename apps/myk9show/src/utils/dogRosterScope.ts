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

/**
 * Tri-state roster scope. `hasRole` reports false for every role while
 * auth/RBAC is still resolving — indistinguishable, on its own, from a
 * confirmed exhibitor with no full-roster role. "No roles yet" must never
 * collapse into either `'own'` (a confirmed exhibitor scope) or `'all'` (a
 * confirmed staff scope); it is its own state until identity/RBAC settles
 * (LESSONS `offline-identity-pairing`).
 */
export type DogRosterScope = 'unresolved' | 'own' | 'all';

/** Derives {@link DogRosterScope} from the auth context's own resolved signal. */
export function deriveDogRosterScope(
  identityResolved: boolean,
  hasRole: (role: UserRole) => boolean
): DogRosterScope {
  if (!identityResolved) return 'unresolved';
  return rosterIsOwnDogsOnly(hasRole) ? 'own' : 'all';
}
