import { USER_ROLE_HIERARCHY } from '@/types/auth-types';
import { ROLE_LABELS, CLUB_SCOPED_ROLES } from '@/services/rbac/roleUiConstants';

/** The subset of a club/show-scoped role assignment this needs — kept minimal
 * so a test fixture doesn't have to construct a full `UserRoleWithDetails`. */
export interface RoleScopeEntry {
  role?: { name?: string | null } | null;
  scope_type?: string | null;
  scope_id?: string | null;
  is_active?: boolean;
}

/**
 * Builds the plain-words role badges for the account page: a club-scoped role
 * (secretary, club_admin) reads as "Secretary: Riverside Kennel Club" once for
 * each distinct club it is actually granted for; every other role reads as its
 * bare label. Falls back to the bare label for a club-scoped role when no
 * matching scope/club-name data is available yet (loading, or an unscoped
 * legacy grant), so a role is never silently dropped from the list.
 */
export function describeUserRoleBadges(
  activeRoleNames: readonly string[],
  rbacRoleScopes: readonly RoleScopeEntry[],
  clubNameById: ReadonlyMap<string, string>
): string[] {
  const activeSet = new Set(activeRoleNames);
  const labels: string[] = [];

  for (const role of USER_ROLE_HIERARCHY) {
    if (!activeSet.has(role)) continue;

    const roleLabel = ROLE_LABELS[role] ?? role;

    if (!CLUB_SCOPED_ROLES.has(role)) {
      labels.push(roleLabel);
      continue;
    }

    // Keyed by club id, not the rendered label — two distinct clubs can
    // legitimately share a display name, and a label-keyed Set would
    // silently collapse that into one badge even though the grants differ.
    const scopedClubIds = new Set<string>();
    for (const entry of rbacRoleScopes) {
      if (
        entry.is_active === false ||
        entry.role?.name !== role ||
        entry.scope_type !== 'club' ||
        !entry.scope_id ||
        !clubNameById.has(entry.scope_id)
      ) {
        continue;
      }
      scopedClubIds.add(entry.scope_id);
    }

    if (scopedClubIds.size > 0) {
      const scopedLabels = [...scopedClubIds]
        .map(clubId => `${roleLabel}: ${clubNameById.get(clubId)}`)
        .sort();
      labels.push(...scopedLabels);
    } else {
      labels.push(roleLabel);
    }
  }

  return labels;
}
