/**
 * The roster's views, filter bar and result line — the list toolkit
 * (docs/plan-list-toolkit.md) configured with the roster's fields.
 *
 * Replaces the stat cards (UserManagementStats) and the expandable Filters
 * panel (UserFilters): the counts now live on the "Show" select. Status and
 * Last sign-in fields were cut by MYK9-906 — the views cover both.
 */

import { useMemo } from 'react';
import {
  ListFilterBar,
  ListResultLine,
  ListViewTabs,
  summarizeFilters,
  type ListFilterField,
} from '@/components/list-toolkit';
import { USER_ROLE_HIERARCHY } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { ROLE_CONFIG } from '@/components/admin/users/UserTable/types';
import { calculateRoleStats, filterUsers } from './UserManagementPage.helpers';
import { DEFAULT_USER_FILTER, type UserFilter } from './UserManagementPage.types';
import { activeUserViewId, buildUserViews, userViewFilters } from './userListViews';

const USER_NOUN = ['user', 'users'] as const;

interface UserListToolbarProps<T extends User> {
  /** The whole roster, for view and option counts. */
  users: T[];
  /**
   * The single clock the page uses for its own filtering — shared here so a
   * view's count and the rows it actually shows can never disagree.
   */
  now: number;
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

export function UserListToolbar<T extends User>({
  users,
  now,
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
  const views = useMemo(() => buildUserViews(users, now), [users, now]);
  const activeViewId = activeUserViewId(filters, now);
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
      allLabel: 'Hidden',
      options: [{ value: 'include', label: 'Included' }],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ListViewTabs
        label="User views"
        views={views}
        activeId={activeViewId}
        onSelect={id => onFiltersChange(userViewFilters(id, now))}
      />
      <ListFilterBar
        searchValue={searchTerm}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search by name, email, or phone..."
        fields={fields}
      />
      <ListResultLine
        shown={matchCount}
        total={users.length}
        noun={USER_NOUN}
        filtered={hasActiveFilters}
        filterSummary={summarizeFilters({ search: searchTerm, views, activeViewId, fields })}
        onShowAll={onClearAll}
        selectAll={{ selectedCount, onSelectAll: onSelectAllMatching }}
      />
    </div>
  );
}
