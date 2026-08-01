/**
 * Types for UserManagementPage and related components.
 */

import type { UserRole as UserRoleType } from '@/types/user-types';
import type { User } from '@/types/user-types';

export interface UserFilter {
  role: UserRoleType | 'all';
  status: 'active' | 'suspended' | 'all';
  showDeleted: boolean;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
}

/** Which column the whole filtered list is sorted by, before pagination. */
export interface UserSort {
  id: string;
  desc: boolean;
}

export interface SelectedUser {
  id: string;
  user: User;
}

export const DEFAULT_USER_FILTER: UserFilter = {
  role: 'all',
  status: 'all',
  showDeleted: false,
  dateRange: { start: null, end: null },
};

/**
 * True when anything narrows the list. Kept beside the filter type so the
 * toolbar badge, the empty state, and the panel's Reset button all agree on
 * what "filtered" means — they drifted apart once, and the badge went missing
 * while Reset stayed enabled.
 */
export function hasActiveUserFilters(filters: UserFilter, searchTerm: string): boolean {
  return (
    searchTerm.trim() !== '' ||
    filters.role !== 'all' ||
    filters.status !== 'all' ||
    filters.showDeleted ||
    filters.dateRange.start !== null ||
    filters.dateRange.end !== null
  );
}

/** How many filter dimensions are active — shown on the Filters button. */
export function countActiveUserFilters(filters: UserFilter): number {
  let count = 0;
  if (filters.role !== 'all') count += 1;
  if (filters.status !== 'all') count += 1;
  if (filters.showDeleted) count += 1;
  if (filters.dateRange.start !== null) count += 1;
  if (filters.dateRange.end !== null) count += 1;
  return count;
}
