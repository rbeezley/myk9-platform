/**
 * Shared display helpers for RBAC permissions.
 *
 * A permission's `code` looks like `"show:manage"`. The DB row may also carry
 * explicit `resource`/`action`/`display_name` virtual fields. These helpers
 * prefer the explicit field and fall back to parsing the code, so every surface
 * (grid, editor, inventory) labels and groups permissions identically.
 */
import type { Permission } from '@/types/rbac-types';

/** Resource bucket a permission belongs to, e.g. `"show"` from `"show:manage"`. */
export const getPermissionResource = (p: Permission): string =>
  p.resource || p.code?.split(':')[0] || 'other';

/** Action segment of a permission, e.g. `"manage"` from `"show:manage"`. */
export const getPermissionAction = (p: Permission): string =>
  p.action || p.code?.split(':')[1] || '';

/** Human-readable label for a permission. */
export const getPermissionDisplayName = (p: Permission): string => p.display_name || p.name;
