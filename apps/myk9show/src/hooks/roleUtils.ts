/**
 * Role utility helpers for priority-based role resolution.
 *
 * Priority order (highest → lowest):
 *   SITE_ADMIN > CLUB_ADMIN > SECRETARY > JUDGE > EXHIBITOR
 *
 * Note: CHAIRMAN and STEWARD are not assigned dashboards and fall through
 * to EXHIBITOR as the catch-all destination.
 */

import { UserRole } from '@/types/auth-types';

/**
 * Explicit dashboard priority order.
 * Roles not listed here have no dedicated dashboard and land on exhibitor/dashboard.
 */
export const DASHBOARD_ROLE_PRIORITY: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.CLUB_ADMIN,
  UserRole.SECRETARY,
  UserRole.JUDGE,
  UserRole.EXHIBITOR,
];

/**
 * Lookup table mapping each role to its dashboard route.
 *
 * JUDGE intentionally shares /exhibitor/dashboard — no judge-specific
 * landing page exists yet, and this is a deliberate routing decision.
 */
export const ROLE_DASHBOARD_ROUTES: Record<string, string> = {
  [UserRole.SITE_ADMIN]: '/admin/dashboard',
  [UserRole.CLUB_ADMIN]: '/secretary/dashboard',
  [UserRole.SECRETARY]: '/secretary/dashboard',
  // INTENT: JUDGE has no dedicated dashboard. Route to exhibitor/dashboard
  // until a judge-specific landing page is built. This is intentional.
  [UserRole.JUDGE]: '/exhibitor/dashboard',
  [UserRole.EXHIBITOR]: '/exhibitor/dashboard',
};

/**
 * Returns the single highest-priority role from a set of user roles.
 * Uses DASHBOARD_ROLE_PRIORITY for ordering.
 *
 * @example
 * getHighestRole([UserRole.EXHIBITOR, UserRole.SITE_ADMIN]) // → UserRole.SITE_ADMIN
 * getHighestRole([UserRole.SECRETARY, UserRole.JUDGE])      // → UserRole.SECRETARY
 * getHighestRole([UserRole.EXHIBITOR])                      // → UserRole.EXHIBITOR
 * getHighestRole([])                                        // → UserRole.EXHIBITOR (fallback)
 */
export function getHighestRole(roles: UserRole[]): UserRole {
  for (const role of DASHBOARD_ROLE_PRIORITY) {
    if (roles.includes(role)) return role;
  }
  // Fallback: no recognised dashboard role — treat as exhibitor
  return UserRole.EXHIBITOR;
}

/**
 * Returns the dashboard route for the highest-priority role in the given set.
 */
export function getDashboardRoute(roles: UserRole[]): string {
  const highest = getHighestRole(roles);
  return ROLE_DASHBOARD_ROUTES[highest] ?? '/exhibitor/dashboard';
}
