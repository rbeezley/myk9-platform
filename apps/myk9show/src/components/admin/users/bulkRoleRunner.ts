/**
 * Per-user work unit for bulk role Add / Remove / Replace (design.md "Bulk dialog
 * semantics"). Kept free of React state so it's directly unit-testable — the hook
 * (`useBulkActions.handleBulkRoleChange`) wires this into `useBulkDispatch`.
 *
 * `ensureUserHasRole` returns `false` for "already has this active role" — a no-op
 * skip in bulk-add, not an error. It also returns `false`/throws for other reasons,
 * but the pre-dispatch canonical-role validation (see useBulkActions.ts) rejects any
 * unknown role name before any work runs, so the dangerous "role doesn't exist"
 * case cannot reach this runner — only the legitimate already-assigned skip can.
 */
import { supabase } from '@/services/database/supabaseClient';
import { rbacService } from '@/services/rbac/RBACService';
import { CLUB_SCOPED_ROLES, LOCKED_ROLES } from '@/services/rbac/roleUiConstants';
import type { BulkRoleMode, BulkRoleSubmitConfig } from './BulkRoleDialog';

interface ActiveAssignmentRow {
  roleName: string;
  clubId: string | null;
}

async function fetchActiveAssignments(userId: string): Promise<ActiveAssignmentRow[]> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('id, role_id, club_id, roles(name)')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    roleName: (row.roles as { name: string } | null)?.name ?? '',
    clubId: (row.club_id as string | null) ?? null,
  }));
}

async function addRolesToUser(userId: string, roleNames: string[], clubIds: string[]) {
  for (const roleName of roleNames) {
    if (CLUB_SCOPED_ROLES.has(roleName)) {
      for (const clubId of clubIds) {
        // false = user already has this role/scope — a legitimate skip, not a
        // failure; do not throw.
        await rbacService.ensureUserHasRole(userId, roleName, { clubId });
      }
    } else {
      await rbacService.ensureUserHasRole(userId, roleName);
    }
  }
}

async function removeRolesFromUser(userId: string, roleNames: string[], clubIds: string[]) {
  for (const roleName of roleNames) {
    if (CLUB_SCOPED_ROLES.has(roleName)) {
      for (const clubId of clubIds) {
        await rbacService.revokeRole({
          userId,
          roleName,
          scopeType: 'club',
          scopeId: clubId,
        });
      }
    } else {
      await rbacService.revokeRole({ userId, roleName });
    }
  }
}

async function replaceRolesForUser(userId: string, roleNames: string[], clubIds: string[]) {
  const assignments = await fetchActiveAssignments(userId);

  // Validate → revoke → add ordering (design.md): revoke happens only after the
  // caller has already validated `roleNames` against the canonical role table
  // (see useBulkActions.handleBulkRoleChange), so a throw here always fails this
  // user honestly rather than leaving them half-applied.
  for (const assignment of assignments) {
    if (!assignment.roleName || LOCKED_ROLES.has(assignment.roleName)) continue;

    if (CLUB_SCOPED_ROLES.has(assignment.roleName)) {
      const roleSelected = roleNames.includes(assignment.roleName);
      const clubInTarget =
        roleSelected && !!assignment.clubId && clubIds.includes(assignment.clubId);
      if (!assignment.clubId) {
        // Legacy migrations created secretary/club_admin assignments without a
        // club_id. Replace must remove that global grant when the target is a
        // club-scoped set; otherwise narrowing a user to selected clubs leaves
        // their old broad access active.
        await rbacService.revokeRole({ userId, roleName: assignment.roleName });
      } else if (!clubInTarget) {
        await rbacService.revokeRole({
          userId,
          roleName: assignment.roleName,
          scopeType: 'club',
          scopeId: assignment.clubId,
        });
      }
    } else if (!roleNames.includes(assignment.roleName)) {
      await rbacService.revokeRole({ userId, roleName: assignment.roleName });
    }
  }

  await addRolesToUser(userId, roleNames, clubIds);

  // Locked roles (exhibitor) are hidden in the Replace UI, so they never appear
  // in `roleNames` — mirror the single-user dialog's repair behavior (it forces
  // LOCKED_ROLES into the effective set) by ensuring every locked role after the
  // revoke phase. A user missing exhibitor gets it back; `false` (already
  // assigned, the normal case) is a no-op.
  for (const lockedRole of LOCKED_ROLES) {
    await rbacService.ensureUserHasRole(userId, lockedRole);
  }
}

/** Applies one bulk role-change config to a single user. Throws on real failures. */
export async function applyBulkRoleChangeToUser(
  userId: string,
  config: BulkRoleSubmitConfig
): Promise<void> {
  const { mode, roleNames, clubIds } = config;
  if (mode === 'replace') {
    await replaceRolesForUser(userId, roleNames, clubIds);
    return;
  }
  if (mode === 'remove') {
    await removeRolesFromUser(userId, roleNames, clubIds);
    return;
  }
  await addRolesToUser(userId, roleNames, clubIds);
}

export type { BulkRoleMode, BulkRoleSubmitConfig };
