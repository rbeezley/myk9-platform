/**
 * Pure helper functions for UserManagementPage.
 */

import type { User } from '@/types/user-types';
import type { UserRole as UserRoleType } from '@/types/user-types';
import type { UserFilter } from './UserManagementPage.types';

/**
 * Filter users based on search term and filter settings.
 */
export function filterUsers<T extends User>(users: T[], searchTerm: string, filters: UserFilter): T[] {
  let filtered = users;

  // Apply search filter
  if (searchTerm.trim()) {
    const search = searchTerm.toLowerCase();
    filtered = filtered.filter(
      user =>
        user.firstName?.toLowerCase().includes(search) ||
        user.lastName?.toLowerCase().includes(search) ||
        user.email?.toLowerCase().includes(search)
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

  // Apply club affiliation filter
  if (filters.clubAffiliation) {
    filtered = filtered.filter(
      user =>
        user.firstName?.toLowerCase().includes(filters.clubAffiliation.toLowerCase()) ||
        user.lastName?.toLowerCase().includes(filters.clubAffiliation.toLowerCase())
    );
  }

  return filtered;
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
