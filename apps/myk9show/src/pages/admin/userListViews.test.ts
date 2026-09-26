import { describe, it, expect } from 'vitest';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { UserRole } from '@/types/auth-types';
import { filterUsers, matchesLoginFilter } from './UserManagementPage.helpers';
import { DEFAULT_USER_FILTER } from './UserManagementPage.types';
import { parseUserListParams, userListParamsToSearch } from './userListParams';
import { activeUserViewId, buildUserViews, userViewFilters } from './userListViews';

const NOW = new Date(2026, 8, 26, 12).getTime();
const daysAgo = (days: number) => new Date(NOW - days * 86_400_000).toISOString();

function user(id: string, patch: Partial<AdminUser>): AdminUser {
  return {
    id,
    firstName: id,
    lastName: 'Test',
    email: `${id}@example.com`,
    roles: [UserRole.EXHIBITOR],
    status: 'active',
    createdAt: new Date(NOW - 365 * 86_400_000),
    updatedAt: new Date(NOW),
    lastSignInAt: null,
    ...patch,
  } as AdminUser;
}

const roster: AdminUser[] = [
  user('fresh', { lastSignInAt: daysAgo(2), createdAt: new Date(NOW - 2 * 86_400_000) }),
  user('month', { lastSignInAt: daysAgo(30) }),
  user('gap', { lastSignInAt: daysAgo(60) }),
  user('dormant', { lastSignInAt: daysAgo(120) }),
  user('never', { lastSignInAt: null }),
  user('suspended', { lastSignInAt: daysAgo(5), status: 'suspended' }),
];

describe('matchesLoginFilter', () => {
  it('buckets sign-ins: within 30 days, 90+ days, never — and 31-89 days in neither', () => {
    expect(matchesLoginFilter(daysAgo(30), 'recent30', NOW)).toBe(true);
    expect(matchesLoginFilter(daysAgo(31), 'recent30', NOW)).toBe(false);
    expect(matchesLoginFilter(daysAgo(60), 'dormant90', NOW)).toBe(false);
    expect(matchesLoginFilter(daysAgo(90), 'dormant90', NOW)).toBe(true);
    expect(matchesLoginFilter(null, 'never', NOW)).toBe(true);
    expect(matchesLoginFilter(null, 'recent30', NOW)).toBe(false);
    expect(matchesLoginFilter(null, 'dormant90', NOW)).toBe(false);
    expect(matchesLoginFilter(daysAgo(1), 'never', NOW)).toBe(false);
    expect(matchesLoginFilter(null, 'all', NOW)).toBe(true);
  });

  it('filterUsers applies the login bucket', () => {
    const ids = (login: 'recent30' | 'dormant90' | 'never') =>
      filterUsers(roster, '', { ...DEFAULT_USER_FILTER, login }, NOW).map(u => u.id);
    expect(ids('recent30')).toEqual(['fresh', 'month', 'suspended']);
    expect(ids('dormant90')).toEqual(['dormant']);
    expect(ids('never')).toEqual(['never']);
  });
});

describe('user views', () => {
  it('counts each view over the whole roster and ends with the requests link', () => {
    const views = buildUserViews(roster, NOW);
    const counts = Object.fromEntries(views.map(view => [view.id, view.count]));
    expect(counts).toEqual({
      all: 6,
      recent: 3,
      new: 1,
      dormant: 1,
      never: 1,
      suspended: 1,
      'role-requests': undefined,
    });
    expect(views.at(-1)?.href).toBe('/admin/role-requests');
  });

  // Codex P2: with "Removed users" on, the roster query returns removed people
  // too, but pressing a view turns that option off — so its count must not
  // include them, or "All 100" shows fewer once clicked.
  it('counts each view without removed people, as pressing it would show', () => {
    const withRemoved = [
      ...roster,
      user('removed', { deletedAt: new Date(NOW).toISOString(), lastSignInAt: null }),
    ];
    const counts = Object.fromEntries(
      buildUserViews(withRemoved, NOW).map(view => [view.id, view.count])
    );
    expect(counts.all).toBe(6);
    expect(counts.never).toBe(1);
  });

  it('filterUsers leaves removed people out unless "Removed users" is on', () => {
    const withRemoved = [...roster, user('removed', { deletedAt: new Date(NOW).toISOString() })];
    expect(filterUsers(withRemoved, '', DEFAULT_USER_FILTER, NOW)).toHaveLength(6);
    expect(
      filterUsers(withRemoved, '', { ...DEFAULT_USER_FILTER, showDeleted: true }, NOW)
    ).toHaveLength(7);
  });

  it('is active only when the filters match a view exactly', () => {
    expect(activeUserViewId(DEFAULT_USER_FILTER, NOW)).toBe('all');
    expect(activeUserViewId(userViewFilters('dormant', NOW), NOW)).toBe('dormant');
    expect(activeUserViewId(userViewFilters('new', NOW), NOW)).toBe('new');
    // A view plus one more narrowing is a custom filter, not the view.
    expect(
      activeUserViewId({ ...userViewFilters('dormant', NOW), role: UserRole.JUDGE }, NOW)
    ).toBeNull();
  });

  it('a view survives the URL round trip and still reads as active', () => {
    for (const id of ['recent', 'new', 'dormant', 'never', 'suspended']) {
      const search = userListParamsToSearch({
        ...parseUserListParams(new URLSearchParams()),
        filters: userViewFilters(id, NOW),
      });
      const back = parseUserListParams(search);
      expect(activeUserViewId(back.filters, NOW)).toBe(id);
    }
  });

  it('writes the login bucket as ?login= and ignores an unknown value', () => {
    const search = userListParamsToSearch({
      ...parseUserListParams(new URLSearchParams()),
      filters: { ...DEFAULT_USER_FILTER, login: 'never' },
    });
    expect(search.get('login')).toBe('never');
    expect(parseUserListParams(new URLSearchParams('login=sometimes')).filters.login).toBe('all');
  });
});
