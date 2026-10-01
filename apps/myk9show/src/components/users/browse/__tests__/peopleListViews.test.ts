import { describe, it, expect } from 'vitest';
import { DEFAULT_PEOPLE_FILTERS } from '@/hooks/useBrowsePeopleData';
import { UserRole, type User } from '@/types/user-types';
import {
  PEOPLE_VIEWS,
  activePeopleViewId,
  buildPeopleViews,
  peopleViewFilterPatch,
} from '../peopleListViews';

function person(overrides: Partial<User>): User {
  return {
    id: overrides.id ?? 'p',
    firstName: 'A',
    lastName: 'B',
    ...overrides,
  } as User;
}

const PEOPLE: User[] = [
  person({ id: 'p-1', roles: [UserRole.SECRETARY], user_id: 'auth-1' }),
  person({ id: 'p-2', roles: [UserRole.JUDGE], user_id: 'auth-2' }),
  person({ id: 'p-3', roles: [UserRole.EXHIBITOR], user_id: 'auth-3' }),
  person({ id: 'p-4', roles: [UserRole.CLUB_ADMIN], user_id: 'auth-4' }),
  // No linked auth user — this is the only "No login" row.
  person({ id: 'p-5', roles: [UserRole.EXHIBITOR] }),
  person({ id: 'p-6', roles: [], user_id: 'auth-6' }),
];

describe('peopleViewFilterPatch', () => {
  it('resets every view field, applying only the named view', () => {
    expect(peopleViewFilterPatch('secretaries')).toEqual({
      role: 'secretary',
      login: 'all',
    });
    expect(peopleViewFilterPatch('no-login')).toEqual({
      role: 'all',
      login: 'none',
    });
  });

  it('falls back to the first view (All) for an unknown id', () => {
    expect(peopleViewFilterPatch('nope')).toEqual(peopleViewFilterPatch(PEOPLE_VIEWS[0].id));
  });
});

describe('activePeopleViewId', () => {
  it('matches a view whose role/login exactly agree, ignoring search', () => {
    expect(activePeopleViewId({ ...DEFAULT_PEOPLE_FILTERS, role: 'judge', search: 'ada' })).toBe(
      'judges'
    );
    expect(activePeopleViewId({ ...DEFAULT_PEOPLE_FILTERS, login: 'none' })).toBe('no-login');
  });

  it('reads as a custom filter once a view is narrowed further', () => {
    expect(
      activePeopleViewId({ ...DEFAULT_PEOPLE_FILTERS, role: 'judge', login: 'none' })
    ).toBeNull();
  });
});

describe('buildPeopleViews', () => {
  it('counts each view over the whole roster, independent of search', () => {
    const views = buildPeopleViews(PEOPLE);
    const byId = Object.fromEntries(views.map(v => [v.id, v.count]));
    expect(byId.all).toBe(6);
    expect(byId.secretaries).toBe(1);
    expect(byId.judges).toBe(1);
    expect(byId.exhibitors).toBe(2);
    expect(byId['club-admins']).toBe(1);
    expect(byId['no-login']).toBe(1);
  });
});
