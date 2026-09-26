/**
 * The roster's built-in views (docs/plan-list-toolkit.md). Each is a filter
 * preset; its count replaces the old stat cards, which described the current
 * page ("Users in view", "Roles in view") rather than anything to act on.
 *
 * A view is active only when the filters match it exactly — any further
 * narrowing reads as a custom filter, so the tab never claims more than it
 * shows. Search is independent: it narrows within a view.
 */

import type { ListView } from '@/components/list-toolkit';
import type { User } from '@/types/user-types';
import { filterUsers } from './UserManagementPage.helpers';
import { DEFAULT_USER_FILTER, type UserFilter } from './UserManagementPage.types';

const DAY_MS = 86_400_000;

interface UserViewDefinition {
  id: string;
  label: string;
  filters: (now: number) => UserFilter;
}

/**
 * The exact instant N×24h before `now` — a genuine rolling cutoff, not that
 * day's midnight. Rounding down to midnight would silently widen "last 7
 * days" by up to a day whenever `now` isn't itself midnight (MYK9-837).
 */
function daysAgo(now: number, days: number): Date {
  return new Date(now - days * DAY_MS);
}

const preset = (patch: Partial<UserFilter>) => (): UserFilter => ({
  ...DEFAULT_USER_FILTER,
  ...patch,
});

export const USER_VIEWS: readonly UserViewDefinition[] = [
  { id: 'all', label: 'All', filters: preset({}) },
  { id: 'recent', label: 'Signed in, last 30 days', filters: preset({ login: 'recent30' }) },
  {
    id: 'new',
    label: 'New, last 7 days',
    filters: now => ({
      ...DEFAULT_USER_FILTER,
      dateRange: { start: daysAgo(now, 7), end: null },
    }),
  },
  { id: 'dormant', label: 'Dormant 90+ days', filters: preset({ login: 'dormant90' }) },
  { id: 'never', label: 'Never signed in', filters: preset({ login: 'never' }) },
  { id: 'suspended', label: 'Suspended', filters: preset({ status: 'suspended' }) },
];

/** Requests are worked on their own page; the roster links there, never copies it. */
export const ROLE_REQUESTS_VIEW: ListView = {
  id: 'role-requests',
  label: 'Role requests',
  href: '/admin/role-requests',
};

function sameDay(left: Date | null, right: Date | null): boolean {
  if (left === null || right === null) return left === right;
  return left.toDateString() === right.toDateString();
}

function sameFilters(left: UserFilter, right: UserFilter): boolean {
  return (
    left.role === right.role &&
    left.status === right.status &&
    left.login === right.login &&
    left.showDeleted === right.showDeleted &&
    sameDay(left.dateRange.start, right.dateRange.start) &&
    sameDay(left.dateRange.end, right.dateRange.end)
  );
}

export function activeUserViewId(filters: UserFilter, now: number): string | null {
  return USER_VIEWS.find(view => sameFilters(view.filters(now), filters))?.id ?? null;
}

export function userViewFilters(id: string, now: number): UserFilter {
  return (USER_VIEWS.find(view => view.id === id) ?? USER_VIEWS[0]).filters(now);
}

/** Every built-in view with its count over the whole roster, then the requests link. */
export function buildUserViews<T extends User>(users: T[], now: number): ListView[] {
  return [
    ...USER_VIEWS.map(view => ({
      id: view.id,
      label: view.label,
      count: filterUsers(users, '', view.filters(now), now).length,
    })),
    ROLE_REQUESTS_VIEW,
  ];
}
