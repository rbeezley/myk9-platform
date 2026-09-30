import { UserRole } from '@/types/auth-types';

/**
 * Roles the `/secretary/create-show/wizard` route guard admits. The route and every entry
 * point that links to it (the club page's Add Show) share this list, so a button can never
 * be offered to someone the route will turn away (MYK9-890).
 *
 * Mirrors the server gate in `create_show_with_children`: `is_site_admin() OR
 * is_club_admin(club) OR is_trial_secretary(club)`. `hasRole` answers "holds this role
 * ANYWHERE" from every active row (club-scoped included), so a club-admin-only user
 * passes the route; which CLUB they may create for is `canCreateShowForClub`'s job
 * (MYK9-895).
 */
export const CREATE_SHOW_WIZARD_ROLES: readonly UserRole[] = [
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.SITE_ADMIN,
];

export function canOpenCreateShowWizard(roles: readonly UserRole[] | undefined): boolean {
  return CREATE_SHOW_WIZARD_ROLES.some(role => roles?.includes(role));
}
