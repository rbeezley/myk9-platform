/**
 * Role utility helpers for priority-based role resolution.
 *
 * Priority order follows USER_ROLE_HIERARCHY from auth-types.ts:
 *   SITE_ADMIN > SECRETARY > JUDGE > CLUB_ADMIN > CHAIRMAN > STEWARD > EXHIBITOR
 *
 * Roles without a dashboard entry (CHAIRMAN, STEWARD) fall back to /exhibitor/entries.
 */

import { UserRole } from '@/types/auth-types';
import { getHighestRole } from './getHighestRole';
export { getHighestRole } from './getHighestRole';

/**
 * Lookup table mapping each role to its dashboard route.
 *
 * Priority follows USER_ROLE_HIERARCHY. Roles without an entry fall back to
 * /exhibitor/entries (CHAIRMAN, STEWARD).
 */
export const ROLE_DASHBOARD_ROUTES: Partial<Record<UserRole, string>> = {
  [UserRole.SITE_ADMIN]: '/admin/dashboard',
  [UserRole.CLUB_ADMIN]: '/secretary/dashboard',
  [UserRole.SECRETARY]: '/secretary/dashboard',
  // INTENT: JUDGE routes to /judge/dashboard — a judge-specific landing page
  // was added 2026-05-02 as part of Phase 2 golden-path work.
  [UserRole.JUDGE]: '/judge/dashboard',
  [UserRole.EXHIBITOR]: '/exhibitor/entries',
};

/**
 * Returns the dashboard route for the highest-priority role in the given set.
 */
export function getDashboardRoute(roles: UserRole[]): string {
  const highest = getHighestRole(roles);
  return ROLE_DASHBOARD_ROUTES[highest] ?? '/exhibitor/entries';
}
