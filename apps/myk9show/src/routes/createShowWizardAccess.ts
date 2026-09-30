import { UserRole } from '@/types/auth-types';

/**
 * Roles the `/secretary/create-show/wizard` route guard admits. The route and every entry
 * point that links to it (the club page's Add Show) share this list, so a button can never
 * be offered to someone the route will turn away (MYK9-890).
 */
export const CREATE_SHOW_WIZARD_ROLES: readonly UserRole[] = [
  UserRole.SECRETARY,
  UserRole.SITE_ADMIN,
];

export function canOpenCreateShowWizard(roles: readonly UserRole[] | undefined): boolean {
  return CREATE_SHOW_WIZARD_ROLES.some(role => roles?.includes(role));
}
