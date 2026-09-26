/**
 * The roster's views, filter bar and result line — the list toolkit
 * (docs/plan-list-toolkit.md) configured with the roster's fields.
 *
 * Replaces the stat cards (UserManagementStats) and the expandable Filters
 * panel (UserFilters): the counts now live on views the admin can press, and
 * every filter is a removable chip beside the search.
 */

import { useMemo, useState } from 'react';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  type ListFilterField,
} from '@/components/list-toolkit';
import { USER_ROLE_HIERARCHY } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { ROLE_CONFIG } from '@/components/admin/users/UserTable/types';
import { calculateRoleStats, filterUsers } from './UserManagementPage.helpers';
import { DEFAULT_USER_FILTER, type UserFilter } from './UserManagementPage.types';
import { activeUserViewId, buildUserViews, userViewFilters } from './userListViews';

const USER_NOUN = ['user', 'users'] as const;

const LOGIN_LABELS: Record<Exclude<UserFilter['login'], 'all'>, string> = {
  recent30: 'Within 30 days',
  dormant90: 'Not in 90+ days',
  never: 'Never',
};

interface UserListToolbarProps<T extends User> {
  /** The whole roster, for view and option counts. */
  users: T[];
  /** How many rows the current search + filters leave. */
  matchCount: number;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filters: UserFilter;
  onFiltersChange: (filters: UserFilter) => void;
  onClearAll: () => void;
  selectedCount: number;
  onSelectAllMatching: () => void;
  hasActiveFilters: boolean;
}

function countWith<T extends User>(users: T[], filters: UserFilter, now: number): number {
  return filterUsers(users, '', filters, now).length;
}

export function UserListToolbar<T extends User>({
  users,
  matchCount,
  searchTerm,
  onSearchChange,
  filters,
  onFiltersChange,
  onClearAll,
  selectedCount,
  onSelectAllMatching,
  hasActiveFilters,
}: UserListToolbarProps<T>) {
  // One clock for the page's life, so every count and the active-view match agree.
  const [now] = useState(() => Date.now());
  const views = useMemo(() => buildUserViews(users, now), [users, now]);
  // Option counts answer "how many would picking this show", so they follow the
  // removed-users setting (picking an option keeps it) and nothing else.
  const optionBase = { ...DEFAULT_USER_FILTER, showDeleted: filters.showDeleted };
  const roleStats = useMemo(
    () => calculateRoleStats(filterUsers(users, '', optionBase, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- optionBase is derived from filters.showDeleted
    [users, filters.showDeleted, now]
  );

  const fields: ListFilterField[] = [
    {
      kind: 'options',
      key: 'role',
      label: 'Role',
      value: filters.role === 'all' ? null : filters.role,
      onChange: value =>
        onFiltersChange({ ...filters, role: (value ?? 'all') as UserFilter['role'] }),
      options: USER_ROLE_HIERARCHY.map(role => ({
        value: role,
        label: ROLE_CONFIG[role]?.label ?? role,
        count: roleStats[role] ?? 0,
      })),
    },
    {
      kind: 'options',
      key: 'status',
      label: 'Status',
      value: filters.status === 'all' ? null : filters.status,
      onChange: value =>
        onFiltersChange({ ...filters, status: (value ?? 'all') as UserFilter['status'] }),
      options: (['active', 'suspended'] as const).map(status => ({
        value: status,
        label: status === 'active' ? 'Active' : 'Suspended',
        count: countWith(users, { ...optionBase, status }, now),
      })),
    },
    {
      kind: 'options',
      key: 'login',
      label: 'Last sign-in',
      value: filters.login === 'all' ? null : filters.login,
      onChange: value =>
        onFiltersChange({ ...filters, login: (value ?? 'all') as UserFilter['login'] }),
      options: (Object.keys(LOGIN_LABELS) as (keyof typeof LOGIN_LABELS)[]).map(login => ({
        value: login,
        label: LOGIN_LABELS[login],
        count: countWith(users, { ...optionBase, login }, now),
      })),
    },
    {
      kind: 'dateRange',
      key: 'created',
      label: 'Created',
      value: filters.dateRange,
      onChange: dateRange => onFiltersChange({ ...filters, dateRange }),
    },
    {
      kind: 'options',
      key: 'deleted',
      label: 'Removed users',
      value: filters.showDeleted ? 'include' : null,
      onChange: value => onFiltersChange({ ...filters, showDeleted: value === 'include' }),
      options: [{ value: 'include', label: 'Included' }],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ListViewTabs
        label="User views"
        views={views}
        activeId={activeUserViewId(filters, now)}
        onSelect={id => onFiltersChange(userViewFilters(id, now))}
      />
      <ListFilterBar
        searchValue={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by name, email, or phone..."
        fields={fields}
        onClearAll={onClearAll}
      />
      <ListResultLine
        shown={matchCount}
        total={users.length}
        noun={USER_NOUN}
        filtered={hasActiveFilters}
        selectAll={{ selectedCount, onSelectAll: onSelectAllMatching }}
      />
    </div>
  );
}
