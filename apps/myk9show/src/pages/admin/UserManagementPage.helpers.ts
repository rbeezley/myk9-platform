/**
 * Pure helper functions for UserManagementPage.
 *
 * Scope note: the page's only data source is the `get_admin_user_list` RPC
 * (migration 066), which returns id / name / email / phone / status / roles /
 * created_at / updated_at / last_sign_in_at / deleted_at. Club affiliations and
 * membership IDs are NOT returned, so nothing here may filter or sort on them —
 * a filter over an always-undefined field silently empties the table.
 */

import type { User } from '@/types/user-types';
import type { UserRole as UserRoleType } from '@/types/user-types';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import type { UserFilter, UserSort } from './UserManagementPage.types';

/** Start of the day, so "created after Jul 3" includes everything on Jul 3. */
function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** End of the day, so "created before Jul 3" includes everything on Jul 3. */
function endOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Filter users based on search term and filter settings.
 *
 * Search covers the fields the table actually renders: name, email, phone.
 */
export function filterUsers<T extends User>(
  users: T[],
  searchTerm: string,
  filters: UserFilter
): T[] {
  let filtered = users;

  // Apply search filter
  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filtered = filtered.filter(
      user =>
        user.firstName?.toLowerCase().includes(search) ||
        user.lastName?.toLowerCase().includes(search) ||
        user.email?.toLowerCase().includes(search) ||
        user.phone?.toLowerCase().includes(search)
    );
  }

  // Apply role filter
  if (filters.role !== 'all') {
    filtered = filtered.filter(user => user.roles?.includes(filters.role as UserRoleType));
  }

  // Apply status filter
  if (filters.status !== 'all') {
    filtered = filtered.filter(user => user.status === filters.status);
  }

  // Apply created-date range
  const { start, end } = filters.dateRange;
  if (start) {
    const from = startOfDay(start);
    filtered = filtered.filter(user => !!user.createdAt && user.createdAt.getTime() >= from);
  }
  if (end) {
    const to = endOfDay(end);
    filtered = filtered.filter(user => !!user.createdAt && user.createdAt.getTime() <= to);
  }

  return filtered;
}

/**
 * Sort value for a column id. Must mirror the table's `accessorFn`s — the table
 * reports which column is sorted, but the page owns the sort so it applies to
 * the whole filtered set rather than only the visible page.
 */
function sortValue(user: AdminUser, columnId: string): string {
  switch (columnId) {
    case 'name':
      return `${user.firstName || ''} ${user.lastName || ''}`.trim().toLowerCase();
    case 'email':
      return user.email?.toLowerCase() ?? '';
    case 'role':
      return user.roles?.[0] ?? '';
    case 'lastLogin':
      return user.lastSignInAt ?? '';
    case 'status':
      return user.status ?? 'active';
    default:
      return '';
  }
}

/**
 * Sort the full filtered list before pagination slices it.
 *
 * Sorting inside the table would only reorder the 25 rows already on screen,
 * which silently misreports "oldest login" on any multi-page list.
 */
export function sortUsers(users: AdminUser[], sort: UserSort | null): AdminUser[] {
  if (!sort) return users;
  const direction = sort.desc ? -1 : 1;
  return [...users].sort((a, b) => {
    const left = sortValue(a, sort.id);
    const right = sortValue(b, sort.id);
    if (left === right) return 0;
    // Blanks ("Never" logged in, no email) sort last in both directions so they
    // never crowd out the rows the admin is looking for.
    if (left === '') return 1;
    if (right === '') return -1;
    return left < right ? -direction : direction;
  });
}

/**
 * Calculate role distribution statistics from a list of users.
 */
export function calculateRoleStats(users: User[]): Record<string, number> {
  const stats: Record<string, number> = {};
  users.forEach(user => {
    user.roles?.forEach(role => {
      stats[role] = (stats[role] || 0) + 1;
    });
  });
  return stats;
}

/**
 * Count users whose account is actually usable — active status, not deleted.
 * (Previously counted "has an email and a first name", which measured profile
 * completeness, not account state.)
 */
export function countActiveUsers(users: User[]): number {
  return users.filter(user => (user.status ?? 'active') === 'active' && !user.deletedAt).length;
}

/**
 * Export filtered users as a CSV download.
 */
export function exportUsersCSV(filteredUsers: User[]): void {
  const csvRows = [
    ['Email', 'First Name', 'Last Name', 'Roles'].join(','),
    ...filteredUsers.map(u =>
      [u.email ?? '', u.firstName ?? '', u.lastName ?? '', (u.roles ?? []).join(';')]
        .map(v => `"${v.replace(/"/g, '""')}"`)
        .join(',')
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
