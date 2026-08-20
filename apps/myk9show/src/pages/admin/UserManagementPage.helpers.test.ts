import { describe, it, expect } from 'vitest';
import type { User } from '@/types/user-types';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import { UserRole } from '@/types/auth-types';
import {
  countActiveUsers,
  escapeCsvCell,
  filterUsers,
  sortUsers,
} from './UserManagementPage.helpers';
import {
  DEFAULT_USER_FILTER,
  countActiveUserFilters,
  hasActiveUserFilters,
} from './UserManagementPage.types';

describe('filterUsers status filter', () => {
  const users = [
    {
      id: '1',
      status: 'active',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
    },
    {
      id: '2',
      status: 'suspended',
      firstName: 'Bob',
      lastName: 'Jones',
      email: 'bob@example.com',
    },
    {
      id: '3',
      status: 'active',
      firstName: 'Carol',
      lastName: 'Davis',
      email: 'carol@example.com',
    },
  ] as User[];

  it('shows all users when status is "all"', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'all' });
    expect(result).toHaveLength(3);
  });

  it('filters to active only', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'active' });
    expect(result).toHaveLength(2);
    expect(result.every(u => u.status === 'active')).toBe(true);
  });

  it('filters to suspended only', () => {
    const result = filterUsers(users, '', { ...DEFAULT_USER_FILTER, status: 'suspended' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('combines search with status filter', () => {
    const result = filterUsers(users, 'alice', { ...DEFAULT_USER_FILTER, status: 'active' });
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe('Alice');
  });

  it('preserves generic type (AdminUser compatibility)', () => {
    const adminUsers = users.map(u => ({ ...u, lastSignInAt: '2026-01-01' }));
    const result = filterUsers(adminUsers, '', DEFAULT_USER_FILTER);
    expect(result[0].lastSignInAt).toBe('2026-01-01');
  });
});

describe('filterUsers search', () => {
  const users = [
    {
      id: '1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      phone: '555-0100',
    },
    { id: '2', firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', phone: '555-0199' },
  ] as User[];

  it('matches on name and email', () => {
    expect(filterUsers(users, 'smith', DEFAULT_USER_FILTER)).toHaveLength(1);
    expect(filterUsers(users, 'bob@example', DEFAULT_USER_FILTER)).toHaveLength(1);
  });

  it('matches on phone, which the table renders and the placeholder promises', () => {
    expect(filterUsers(users, '555-0199', DEFAULT_USER_FILTER)).toHaveLength(1);
  });
});

// The created-date pickers collected dates, rendered "From:"/"To:" chips, and
// counted toward the active-filter state — but `filterUsers` never read them,
// so the result set never changed.
describe('filterUsers created-date range', () => {
  const users = [
    { id: 'jan', firstName: 'Jan', lastName: 'User', createdAt: new Date('2026-01-15T12:00:00Z') },
    { id: 'jun', firstName: 'Jun', lastName: 'User', createdAt: new Date('2026-06-15T12:00:00Z') },
    { id: 'none', firstName: 'No', lastName: 'Date' },
  ] as User[];

  const range = (start: Date | null, end: Date | null) => ({
    ...DEFAULT_USER_FILTER,
    dateRange: { start, end },
  });

  // Dates are built in local time because that is what the calendar picker
  // hands back. A date-only string ("2026-01-15") parses as UTC midnight, which
  // lands on the previous day west of Greenwich and would make the boundary
  // assertions pass or fail depending on the machine's timezone.
  const localDate = (year: number, monthIndex: number, day: number) =>
    new Date(year, monthIndex, day);

  it('keeps only users created on or after the start date', () => {
    const result = filterUsers(users, '', range(localDate(2026, 2, 1), null));
    expect(result.map(u => u.id)).toEqual(['jun']);
  });

  it('keeps only users created on or before the end date', () => {
    const result = filterUsers(users, '', range(null, localDate(2026, 2, 1)));
    expect(result.map(u => u.id)).toEqual(['jan']);
  });

  it('includes users created on the boundary day itself', () => {
    const result = filterUsers(users, '', range(localDate(2026, 0, 15), localDate(2026, 0, 15)));
    expect(result.map(u => u.id)).toEqual(['jan']);
  });

  it('excludes users with no created date once a range is set', () => {
    const result = filterUsers(users, '', range(localDate(2020, 0, 1), null));
    expect(result.map(u => u.id)).not.toContain('none');
  });
});

// Sorting used to happen inside the table, which only ever held the current
// page — so "oldest login" sorted 25 rows out of 1,000 and reported it as fact.
describe('sortUsers', () => {
  const users = [
    { id: 'b', firstName: 'Bob', lastSignInAt: '2026-05-01' },
    { id: 'a', firstName: 'Alice', lastSignInAt: '2026-01-01' },
    { id: 'n', firstName: 'Never', lastSignInAt: null },
  ] as AdminUser[];

  it('returns the list untouched when nothing is sorted', () => {
    expect(sortUsers(users, null)).toBe(users);
  });

  it('sorts ascending by the requested column', () => {
    expect(sortUsers(users, { id: 'lastLogin', desc: false }).map(u => u.id)).toEqual([
      'a',
      'b',
      'n',
    ]);
  });

  it('sorts descending', () => {
    expect(sortUsers(users, { id: 'lastLogin', desc: true }).map(u => u.id)).toEqual([
      'b',
      'a',
      'n',
    ]);
  });

  it('keeps blanks last in both directions, so they never crowd out real rows', () => {
    expect(sortUsers(users, { id: 'lastLogin', desc: false }).at(-1)?.id).toBe('n');
    expect(sortUsers(users, { id: 'lastLogin', desc: true }).at(-1)?.id).toBe('n');
  });

  it('does not mutate the input', () => {
    const input = [...users];
    sortUsers(input, { id: 'name', desc: true });
    expect(input.map(u => u.id)).toEqual(['b', 'a', 'n']);
  });
});

// "Active Users" used to count `email && firstName` — profile completeness, not
// account state — and was the headline number on an oversight page.
describe('countActiveUsers', () => {
  it('counts by account status, not by how complete the profile is', () => {
    const users = [
      { id: '1', status: 'active', email: undefined, firstName: '' },
      { id: '2', status: 'suspended', email: 'b@example.com', firstName: 'Bob' },
      { id: '3', status: 'active', deletedAt: '2026-07-01', email: 'c@example.com' },
      { id: '4', email: 'd@example.com', firstName: 'Dana' },
    ] as User[];

    // 1 (active, sparse profile) and 4 (status defaults to active) count;
    // 2 is suspended and 3 is removed.
    expect(countActiveUsers(users)).toBe(2);
  });
});

// The Filters badge and the panel's Reset button read from one predicate now —
// they drifted before, so the badge could be absent while Reset was enabled.
describe('active-filter predicates', () => {
  it('counts every filter dimension, including showDeleted and dates', () => {
    expect(countActiveUserFilters(DEFAULT_USER_FILTER)).toBe(0);
    expect(
      countActiveUserFilters({
        ...DEFAULT_USER_FILTER,
        role: UserRole.JUDGE,
        showDeleted: true,
        dateRange: { start: new Date('2026-01-01'), end: null },
      })
    ).toBe(3);
  });

  it('treats a search term as an active filter, but not as a filter chip', () => {
    expect(hasActiveUserFilters(DEFAULT_USER_FILTER, 'ann')).toBe(true);
    expect(countActiveUserFilters(DEFAULT_USER_FILTER)).toBe(0);
    expect(hasActiveUserFilters(DEFAULT_USER_FILTER, '   ')).toBe(false);
  });
});

// A first name of `=HYPERLINK(...)` must open in a spreadsheet as text, not
// execute — admin exports carry user-supplied names and emails.
describe('escapeCsvCell', () => {
  it('defuses leading formula characters with a tab prefix', () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil")')).toBe('"\t=HYPERLINK(""http://evil"")"');
    expect(escapeCsvCell('+1-555-0100')).toBe('"\t+1-555-0100"');
    expect(escapeCsvCell('-lead')).toBe('"\t-lead"');
    expect(escapeCsvCell('@handle')).toBe('"\t@handle"');
  });

  it('quotes ordinary values without altering them', () => {
    expect(escapeCsvCell('Ada Lovelace')).toBe('"Ada Lovelace"');
    expect(escapeCsvCell('a "quoted" name')).toBe('"a ""quoted"" name"');
  });
});
