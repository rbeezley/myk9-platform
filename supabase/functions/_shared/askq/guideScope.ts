import type { AskQGuideAsset } from './documentContext.ts';
import { applyActiveRoleValidity, isCurrentRole } from '../roleValidity.ts';

// MYK9-1775: the secretary and club-admin guides document management actions
// (Remove entry, refunds, approvals) that an exhibitor must never be offered as
// their own. Callers without a staff role get the exhibitor and judge/steward guides only.
export const MANAGEMENT_GUIDE_IDS: ReadonlySet<string> = new Set([
  'secretary-guide',
  'club-admin-guide',
]);

// Owner decision (2026-11-08): any active staff role at any scope (global,
// club-scoped or show-scoped) sees every guide. Per-show RPCs missed show-scoped
// secretaries, so this reads the caller's own role rows instead.
export const STAFF_GUIDE_ROLES: ReadonlySet<string> = new Set([
  'secretary',
  'club_admin',
  'steward',
  'judge',
  'site_admin',
]);

export interface StaffRoleRow {
  is_active?: boolean | null;
  expires_at?: string | null;
  role?: { name?: unknown } | null;
}

/** Pure check over role rows; expired or inactive rows never count. */
export function rolesGrantAllGuides(rows: unknown, now = new Date()): boolean {
  if (!Array.isArray(rows)) return false;
  return (rows as StaffRoleRow[]).some(
    row =>
      !!row &&
      isCurrentRole({ is_active: row.is_active, expires_at: row.expires_at }, now) &&
      typeof row.role?.name === 'string' &&
      STAFF_GUIDE_ROLES.has(row.role.name)
  );
}

/**
 * Reads the caller's own active, unexpired `user_roles` rows. Fails closed: an
 * error or an unexpected shape is "not staff", so the management guides stay out.
 */
export async function callerHoldsStaffRole(
  client: { from(table: 'user_roles'): { select(columns: string): unknown } },
  authUserId: string
): Promise<boolean> {
  const query = client.from('user_roles').select('is_active, expires_at, role:roles(name)') as {
    eq(c: string, v: unknown): unknown;
  };
  const { data, error } = (await applyActiveRoleValidity(
    query.eq('auth_user_id', authUserId) as never
  )) as { data: unknown; error: { message: string } | null };
  if (error) return false;
  return rolesGrantAllGuides(data);
}

export function scopeGuidesToRole(
  guides: AskQGuideAsset[],
  hasStaffRole: boolean
): AskQGuideAsset[] {
  if (hasStaffRole) return guides;
  return guides.filter(guide => !MANAGEMENT_GUIDE_IDS.has(guide.id));
}
