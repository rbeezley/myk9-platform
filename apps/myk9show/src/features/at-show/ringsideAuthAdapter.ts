/**
 * Ringside auth adapter (Phase 1a).
 *
 * `@myk9/ringside` expects a passcode-style 4-role model
 * (`admin | judge | steward | exhibitor`) plus a `canAccess(permission)`
 * checker derived from that role (see `getPermissionsForRole`). myK9Show
 * authenticates via Supabase RBAC with 7 roles and async DB permissions.
 *
 * This adapter bridges the two for the `/at-show` mount spike: it maps
 * myK9Show's account RBAC role onto ringside's 4-role enum and derives
 * the ringside permission bag from that mapped role.
 *
 * INTENT: this is the Phase 1a stand-in. The eventual model (plan Locked
 * Decision #8 / Phase 1c) is signed-in account + a per-show *passcode*
 * that supplies the true ringside role. Until that passcode-merge lands,
 * the account's RBAC role drives ringside access. Do not delete the
 * account→ringside mapping when 1c arrives — passcode-less account users
 * (e.g. a secretary who never types a passcode) still need it.
 */

import {
  getPermissionsForRole,
  type UserRole as RingsideRole,
  type UserPermissions as RingsidePermissions,
  type RingsideAuth,
  type RingsideShowContext,
} from '@myk9/ringside';
import { UserRole as ShowRole } from '@/types/auth-types';

/**
 * Map a myK9Show RBAC role onto ringside's 4-role model.
 *
 * - Show-running officials (site admin, secretary, club admin, chairman)
 *   → `admin`: they manage classes, check-in, run order at ringside.
 * - `judge` → `judge`, `steward` → `steward`, `exhibitor` → `exhibitor`.
 *
 * Returns `null` for an unknown/absent role so callers render the
 * unauthenticated branch rather than silently granting access.
 */
export function toRingsideRole(showRole: ShowRole | null | undefined): RingsideRole | null {
  switch (showRole) {
    case ShowRole.SITE_ADMIN:
    case ShowRole.SECRETARY:
    case ShowRole.CLUB_ADMIN:
    case ShowRole.CHAIRMAN:
      return 'admin';
    case ShowRole.JUDGE:
      return 'judge';
    case ShowRole.STEWARD:
      return 'steward';
    case ShowRole.EXHIBITOR:
      return 'exhibitor';
    default:
      return null;
  }
}

/**
 * Build the `RingsideAuth` value-snapshot bag for `<RingsideProvider>`.
 *
 * `canAccess` derives from the mapped ringside role via
 * `getPermissionsForRole` — the same role→permission contract ringside
 * uses internally — so an unmapped role denies every permission.
 */
export function buildRingsideAuth(args: {
  showRole: ShowRole | null | undefined;
  showContext: RingsideShowContext | null;
}): RingsideAuth {
  const role = toRingsideRole(args.showRole);
  const permissions: RingsidePermissions | null = role ? getPermissionsForRole(role) : null;

  return {
    role,
    showContext: args.showContext,
    canAccess: (permission: keyof RingsidePermissions) => permissions?.[permission] ?? false,
  };
}
