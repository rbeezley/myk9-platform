/**
 * Pure helpers for the Roles & Permissions overview console.
 *
 * Lives apart from the components so the ordering and matching rules are
 * testable without rendering. See docs/plan-permissions-overview-roles-console.md.
 */
import type { AuditLogEntry, Role } from '@/types/rbac-types';

/**
 * Role id -> ISO timestamp of that role's most recent audit entry.
 *
 * The `roles` table has no `updated_at` column, so "last changed" can only be
 * derived from the audit log. Entries that are not about a role, or that carry
 * no target or timestamp, are skipped rather than guessed at.
 */
export function buildLastChangedMap(entries: AuditLogEntry[]): Map<string, string> {
  const newest = new Map<string, string>();
  for (const entry of entries) {
    if (entry.target_type !== 'role') continue;
    const { target_id: targetId, created_at: createdAt } = entry;
    if (!targetId || !createdAt) continue;
    const existing = newest.get(targetId);
    if (!existing || createdAt > existing) {
      newest.set(targetId, createdAt);
    }
  }
  return newest;
}

export function getRoleDisplayName(role: Role): string {
  if (role.display_name) return role.display_name;
  return role.name.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function getRoleTypeLabel(role: Role): 'System' | 'Custom' {
  return role.is_system ? 'System' : 'Custom';
}

export function filterRoles(roles: Role[], term: string): Role[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return roles;
  return roles.filter(
    role =>
      role.name.toLowerCase().includes(needle) ||
      getRoleDisplayName(role).toLowerCase().includes(needle) ||
      (role.description ?? '').toLowerCase().includes(needle)
  );
}
