/**
 * Types for UserManagementPage and related components.
 */

import type { UserRole as UserRoleType } from '@/types/user-types';
import type { User } from '@/types/user-types';
import { USER_ROLE_HIERARCHY } from '@/types/auth-types';

export interface UserFilter {
  role: UserRoleType | 'all';
  status: 'active' | 'suspended' | 'all';
  /** Sign-in recency bucket — see USER_LOGIN_FILTER_VALUES. */
  login: UserLoginFilter;
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

/**
 * The values each filter accepts. One source for the `<Select>` options and for
 * the URL codec's validation — a role that isn't here is not a role the roster
 * can filter by, however it arrived. Derived from USER_ROLE_HIERARCHY so the
 * filter can never drift from the roles users actually hold (a hand-written
 * copy once offered phantom `admin`/`handler` values that matched nobody while
 * omitting `site_admin`/`club_admin`/`chairman`).
 */
export const USER_ROLE_FILTER_VALUES = ['all', ...USER_ROLE_HIERARCHY] as const;

export const USER_STATUS_FILTER_VALUES = ['all', 'active', 'suspended'] as const;

/**
 * Sign-in recency. `recent30`: signed in within 30 days. `dormant90`: has
 * signed in, but not for 90+ days. `never`: no sign-in on record (invited or
 * created by an admin and never used).
 */
export const USER_LOGIN_FILTER_VALUES = ['all', 'recent30', 'dormant90', 'never'] as const;
export type UserLoginFilter = (typeof USER_LOGIN_FILTER_VALUES)[number];

export const DEFAULT_USER_FILTER: UserFilter = {
  role: 'all',
  status: 'all',
  login: 'all',
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
    filters.login !== 'all' ||
    filters.showDeleted ||
    filters.dateRange.start !== null ||
    filters.dateRange.end !== null
  );
}
