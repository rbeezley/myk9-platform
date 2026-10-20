import { describe, expect, it } from 'vitest';
import { CREATE_HREFS, createHrefFor, resolveCreateGates } from '@/features/actions/createGates';
import { DEFAULT_ROLE_PERMISSIONS, UserRole } from '@/types/auth-types';

// Each role's permissions as the RBAC tables grant them (`people:create` comes from
// migration 140, which the auth-types defaults do not carry).
function viewer(roles: UserRole[], extra: string[] = []) {
  const permissions = new Set<string>([
    ...roles.flatMap(role => DEFAULT_ROLE_PERMISSIONS[role] ?? []),
    ...extra,
  ]);
  return {
    hasRole: (role: UserRole) => roles.includes(role),
    hasPermission: (permission: string) => permissions.has(permission),
  };
}

describe('resolveCreateGates', () => {
  it.each([
    ['exhibitor', [UserRole.EXHIBITOR], [], [false, true, false, false]],
    // A club admin's defaults carry show:create; they manage their club's own shows.
    ['club admin', [UserRole.CLUB_ADMIN], [], [true, false, false, true]],
    ['secretary', [UserRole.SECRETARY], ['people:create'], [true, true, true, true]],
    ['site admin', [UserRole.SITE_ADMIN], ['people:create'], [true, true, true, true]],
  ] as const)('gives a %s the creates their list pages allow', (_label, roles, extra, expected) => {
    const gates = resolveCreateGates(viewer([...roles], [...extra]));
    expect([
      gates.canCreateShows,
      gates.canCreateDogs,
      gates.canCreatePeople,
      gates.canCreateClubs,
    ]).toEqual(expected);
  });

  it('grants nothing to a signed-out viewer', () => {
    expect(Object.values(resolveCreateGates(viewer([])))).toEqual([false, false, false, false]);
  });

  it("points each create at its list page's own panel", () => {
    expect(CREATE_HREFS).toEqual({
      show: '/?wizard=true',
      dog: '/dogs?add=true',
      person: '/people?add=true',
      club: '/clubs?create=true',
    });
  });
});

describe('createHrefFor', () => {
  it.each([
    ['create-club', '/clubs', 'create=true'],
    ['create-dog', '/dogs', 'add=true'],
    ['create-person', '/people', 'add=true'],
  ] as const)('%s opens in place on its own record, keeping path and search', (id, base, param) => {
    const href =
      id === 'create-club'
        ? CREATE_HREFS.club
        : id === 'create-dog'
          ? CREATE_HREFS.dog
          : CREATE_HREFS.person;
    expect(createHrefFor(id, href, `${base}/abc`, '?search=x')).toBe(
      `${base}/abc?search=x&${param}`
    );
    expect(createHrefFor(id, href, base, '')).toBe(`${base}?${param}`);
  });

  it('keeps the plain href off its own list, and for other actions', () => {
    expect(createHrefFor('create-club', CREATE_HREFS.club, '/dogs/1', '?search=x')).toBe(
      '/clubs?create=true'
    );
    expect(createHrefFor('create-club', CREATE_HREFS.club, '/clubsy', '')).toBe(
      '/clubs?create=true'
    );
    expect(createHrefFor('create-show', CREATE_HREFS.show, '/clubs/1', '?a=b')).toBe(
      CREATE_HREFS.show
    );
  });
});
