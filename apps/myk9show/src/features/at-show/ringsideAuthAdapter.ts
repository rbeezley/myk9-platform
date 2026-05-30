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
 * Resolve the effective ringside role AND its permission bag from the two
 * inputs that decide ringside access — the account RBAC role and an optional
 * Phase 1c show-scoped passcode grant. This is the SINGLE home of the
 * precedence rule (Locked Decision #8): a show-scoped passcode `grantRole` is
 * authoritative for its show and overrides the account RBAC mapping — the
 * passcode the secretary handed out *is* the role for that show. The override
 * is unconditional, including the rare case where the grant role is "lower"
 * than the account's RBAC role (e.g. an admin account that deliberately enters
 * an exhibitor passcode to view as an exhibitor for one show). A passcode-less
 * account user (`grantRole` null/absent) still resolves via `toRingsideRole` —
 * preserving this adapter's INTENT (a secretary who never types a passcode
 * keeps ringside access via RBAC).
 *
 * Permissions derive from the resolved role via `getPermissionsForRole` — the
 * same role→permission contract ringside uses internally — so an unmapped role
 * (null) denies every permission. Both `buildRingsideAuth` (the provider auth
 * bag) and `useRingsideEffectiveRole` (the React hook every `/at-show` surface
 * shares) call this, so the precedence rule can never drift between them.
 */
export function resolveRingsideAccess(args: {
  showRole: ShowRole | null | undefined;
  /** Show-scoped passcode grant role (Phase 1c). Takes precedence when present. */
  grantRole?: RingsideRole | null | undefined;
}): { role: RingsideRole | null; permissions: RingsidePermissions | null } {
  const role = args.grantRole ?? toRingsideRole(args.showRole);
  const permissions: RingsidePermissions | null = role ? getPermissionsForRole(role) : null;
  return { role, permissions };
}

/**
 * Build the `RingsideAuth` value-snapshot bag for `<RingsideProvider>`.
 *
 * Role + permission resolution (precedence, INTENT) lives in
 * `resolveRingsideAccess`; this wraps it into the provider's `canAccess` shape.
 */
export function buildRingsideAuth(args: {
  showRole: ShowRole | null | undefined;
  showContext: RingsideShowContext | null;
  /** Show-scoped passcode grant role (Phase 1c). Takes precedence when present. */
  grantRole?: RingsideRole | null;
}): RingsideAuth {
  const { role, permissions } = resolveRingsideAccess({
    showRole: args.showRole,
    grantRole: args.grantRole,
  });

  return {
    role,
    showContext: args.showContext,
    canAccess: (permission: keyof RingsidePermissions) => permissions?.[permission] ?? false,
  };
}
