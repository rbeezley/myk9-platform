/**
 * Role utility helpers for priority-based role resolution.
 *
 * Priority order follows USER_ROLE_HIERARCHY from auth-types.ts:
 *   SITE_ADMIN > SECRETARY > JUDGE > CLUB_ADMIN > CHAIRMAN > STEWARD > EXHIBITOR
 *
 * Roles without a dashboard entry (CHAIRMAN, STEWARD) fall back to /exhibitor/dashboard.
 */

import { UserRole, USER_ROLE_HIERARCHY } from '@/types/auth-types';

/**
 * Lookup table mapping each role to its dashboard route.
 *
 * JUDGE intentionally shares /exhibitor/dashboard — no judge-specific
 * landing page exists yet, and this is a deliberate routing decision.
 */
export const ROLE_DASHBOARD_ROUTES: Partial<Record<UserRole, string>> = {
  [UserRole.SITE_ADMIN]: '/admin/dashboard',
  [UserRole.CLUB_ADMIN]: '/secretary/dashboard',
  [UserRole.SECRETARY]: '/secretary/dashboard',
  // INTENT: JUDGE has no dedicated dashboard. Route to /exhibitor/entries
  // (the consolidated My Shows page) until a judge-specific landing page is built.
  [UserRole.JUDGE]: '/exhibitor/entries',
  [UserRole.EXHIBITOR]: '/exhibitor/entries',
};

/**
 * Returns the single highest-priority role from a set of user roles.
 * Uses USER_ROLE_HIERARCHY for ordering so priority is consistent app-wide.
 *
 * @example
 * getHighestRole([UserRole.EXHIBITOR, UserRole.SITE_ADMIN]) // → UserRole.SITE_ADMIN
 * getHighestRole([UserRole.SECRETARY, UserRole.JUDGE])      // → UserRole.SECRETARY
 * getHighestRole([UserRole.EXHIBITOR])                      // → UserRole.EXHIBITOR
 * getHighestRole([])                                        // → UserRole.EXHIBITOR (fallback)
 */
export function getHighestRole(roles: UserRole[]): UserRole {
  const roleSet = new Set(roles);
  return USER_ROLE_HIERARCHY.find(role => roleSet.has(role)) ?? UserRole.EXHIBITOR;
}

/**
 * Returns the dashboard route for the highest-priority role in the given set.
 */
export function getDashboardRoute(roles: UserRole[]): string {
  const highest = getHighestRole(roles);
  return ROLE_DASHBOARD_ROUTES[highest] ?? '/exhibitor/entries';
}
