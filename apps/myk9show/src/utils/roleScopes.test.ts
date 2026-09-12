import { describe, it, expect } from 'vitest';
import {
  canManageShowSurface,
  canManageShowAsSecretaryOrAdmin,
  filterManagedShows,
  hasScopedClubRole,
  hasScopedShowRole,
  managedClubIds,
} from './roleScopes';
import { ScopeType, UserRole, type UserWithRoles, type RoleScope } from '@/types/auth-types';

function buildUser(scopes: RoleScope[]): UserWithRoles {
  return {
    id: 'user-1',
    scopes,
  } as UserWithRoles;
}

const clubScope: RoleScope = {
  userId: 'user-1',
  roleId: UserRole.CLUB_ADMIN,
  scopeType: ScopeType.CLUB,
  scopeId: 'club-1',
  createdAt: new Date(),
};

const showScope: RoleScope = {
  userId: 'user-1',
  roleId: UserRole.SECRETARY,
  scopeType: ScopeType.SHOW,
  scopeId: 'show-1',
  createdAt: new Date(),
};

describe('hasScopedClubRole', () => {
  it.each<[string, UserWithRoles | null | undefined, UserRole, string | undefined, boolean]>([
    ['null user -> false', null, UserRole.CLUB_ADMIN, 'club-1', false],
    ['undefined user -> false', undefined, UserRole.CLUB_ADMIN, 'club-1', false],
    ['no clubId provided -> false', buildUser([clubScope]), UserRole.CLUB_ADMIN, undefined, false],
    [
      'matching club + role scope -> true',
      buildUser([clubScope]),
      UserRole.CLUB_ADMIN,
      'club-1',
      true,
    ],
    [
      'scope exists but for a different club id -> false',
      buildUser([clubScope]),
      UserRole.CLUB_ADMIN,
      'club-2',
      false,
    ],
    [
      'scope exists for the club but a different role -> false',
      buildUser([clubScope]),
      UserRole.SECRETARY,
      'club-1',
      false,
    ],
    [
      'a SHOW-typed scope with matching id/role does not satisfy a club check',
      buildUser([showScope]),
      UserRole.SECRETARY,
      'show-1',
      false,
    ],
    [
      'user with no scopes array entries -> false',
      buildUser([]),
      UserRole.CLUB_ADMIN,
      'club-1',
      false,
    ],
  ])('%s', (_label, user, role, clubId, expected) => {
    expect(hasScopedClubRole(user, role, clubId)).toBe(expected);
  });
});

describe('hasScopedShowRole', () => {
  it.each<[string, UserWithRoles | null | undefined, UserRole, string | undefined, boolean]>([
    ['null user -> false', null, UserRole.SECRETARY, 'show-1', false],
    ['undefined user -> false', undefined, UserRole.SECRETARY, 'show-1', false],
    ['no showId provided -> false', buildUser([showScope]), UserRole.SECRETARY, undefined, false],
    [
      'matching show + role scope -> true',
      buildUser([showScope]),
      UserRole.SECRETARY,
      'show-1',
      true,
    ],
    [
      'scope exists but for a different show id -> false',
      buildUser([showScope]),
      UserRole.SECRETARY,
      'show-2',
      false,
    ],
    [
      'scope exists for the show but a different role -> false',
      buildUser([showScope]),
      UserRole.CLUB_ADMIN,
      'show-1',
      false,
    ],
    [
      'a CLUB-typed scope with matching id/role does not satisfy a show check',
      buildUser([clubScope]),
      UserRole.CLUB_ADMIN,
      'club-1',
      false,
    ],
  ])('%s', (_label, user, role, showId, expected) => {
    expect(hasScopedShowRole(user, role, showId)).toBe(expected);
  });
});

describe('canManageShowAsSecretaryOrAdmin', () => {
  it('accepts a secretary assigned directly to this show', () => {
    expect(
      canManageShowAsSecretaryOrAdmin({
        isSecretary: true,
        isAdmin: false,
        userWithRoles: buildUser([showScope]),
        clubId: 'club-1',
        showId: 'show-1',
      })
    ).toBe(true);
  });

  it('does not accept a secretary assigned to another show', () => {
    expect(
      canManageShowAsSecretaryOrAdmin({
        isSecretary: true,
        isAdmin: false,
        userWithRoles: buildUser([showScope]),
        clubId: 'club-1',
        showId: 'show-2',
      })
    ).toBe(false);
  });
});

const secretaryClubScope: RoleScope = {
  userId: 'user-1',
  roleId: UserRole.SECRETARY,
  scopeType: ScopeType.CLUB,
  scopeId: 'club-1',
  createdAt: new Date(),
};

describe('canManageShowSurface', () => {
  const clubAdminUser = buildUser([clubScope]);
  const secretaryUser = buildUser([secretaryClubScope]);
  const holdsClubAdmin = (role: UserRole) => role === UserRole.CLUB_ADMIN;
  const holdsNothing = () => false;

  // The server's manage predicates resolve to is_trial_secretary(club), which
  // matches on ur.club_id — so a secretary is NOT global. Granting globally
  // rendered manage controls the database then refused.
  it('grants a secretary scoped to this show’s club', () => {
    expect(
      canManageShowSurface({
        isSecretary: true,
        isAdmin: false,
        hasRole: holdsNothing,
        userWithRoles: secretaryUser,
        clubId: 'club-1',
      })
    ).toBe(true);
  });

  it('denies a secretary viewing another club’s show', () => {
    expect(
      canManageShowSurface({
        isSecretary: true,
        isAdmin: false,
        hasRole: holdsNothing,
        userWithRoles: secretaryUser,
        clubId: 'club-2',
      })
    ).toBe(false);
  });

  it('denies a secretary whose scopes have not loaded', () => {
    expect(
      canManageShowSurface({
        isSecretary: true,
        isAdmin: false,
        hasRole: holdsNothing,
        userWithRoles: null,
        clubId: 'club-1',
      })
    ).toBe(false);
  });

  it('grants a secretary assigned directly to this show', () => {
    expect(
      canManageShowSurface({
        isSecretary: true,
        isAdmin: false,
        hasRole: holdsNothing,
        userWithRoles: buildUser([showScope]),
        clubId: 'club-1',
        showId: 'show-1',
      })
    ).toBe(true);
  });

  it('grants a site admin regardless of club', () => {
    expect(
      canManageShowSurface({
        isSecretary: false,
        isAdmin: true,
        hasRole: holdsNothing,
        userWithRoles: null,
        clubId: undefined,
      })
    ).toBe(true);
  });

  it('grants a club admin scoped to this show’s club', () => {
    expect(
      canManageShowSurface({
        isSecretary: false,
        isAdmin: false,
        hasRole: holdsClubAdmin,
        userWithRoles: clubAdminUser,
        clubId: 'club-1',
      })
    ).toBe(true);
  });

  it('denies a club admin viewing another club’s show', () => {
    expect(
      canManageShowSurface({
        isSecretary: false,
        isAdmin: false,
        hasRole: holdsClubAdmin,
        userWithRoles: clubAdminUser,
        clubId: 'club-2',
      })
    ).toBe(false);
  });

  // The club id is unknown while the parent show is still resolving. Denying
  // is the safe answer: a control that flashes in and then disappears is the
  // same mistake-anxiety bug as never gating it at all.
  it('denies while the show (and therefore its club) is unresolved', () => {
    expect(
      canManageShowSurface({
        isSecretary: false,
        isAdmin: false,
        hasRole: holdsClubAdmin,
        userWithRoles: clubAdminUser,
        clubId: undefined,
      })
    ).toBe(false);
  });

  it('denies an exhibitor', () => {
    expect(
      canManageShowSurface({
        isSecretary: false,
        isAdmin: false,
        hasRole: holdsNothing,
        userWithRoles: buildUser([]),
        clubId: 'club-1',
      })
    ).toBe(false);
  });

  it('denies a signed-out guest', () => {
    expect(
      canManageShowSurface({
        isSecretary: false,
        isAdmin: false,
        hasRole: holdsNothing,
        userWithRoles: null,
        clubId: 'club-1',
      })
    ).toBe(false);
  });
});

describe('managedClubIds', () => {
  const secretaryOfClub1: RoleScope = {
    userId: 'user-1',
    roleId: UserRole.SECRETARY,
    scopeType: ScopeType.CLUB,
    scopeId: 'club-1',
    createdAt: new Date(),
  };
  const clubAdminOfClub2: RoleScope = {
    userId: 'user-1',
    roleId: UserRole.CLUB_ADMIN,
    scopeType: ScopeType.CLUB,
    scopeId: 'club-2',
    createdAt: new Date(),
  };
  const exhibitorOfClub3: RoleScope = {
    userId: 'user-1',
    roleId: UserRole.EXHIBITOR,
    scopeType: ScopeType.CLUB,
    scopeId: 'club-3',
    createdAt: new Date(),
  };

  it('returns null — every club — only for a site admin', () => {
    expect(managedClubIds({ isAdmin: true, userWithRoles: null })).toBeNull();
  });

  it('collects the clubs where the viewer holds a staff role', () => {
    const ids = managedClubIds({
      isAdmin: false,
      userWithRoles: buildUser([secretaryOfClub1, clubAdminOfClub2]),
    });
    expect(ids).toEqual(new Set(['club-1', 'club-2']));
  });

  it('ignores non-staff roles and show-typed scopes', () => {
    const ids = managedClubIds({
      isAdmin: false,
      userWithRoles: buildUser([exhibitorOfClub3, showScope]),
    });
    expect(ids).toEqual(new Set());
  });

  it('returns an empty set — not null — when scopes have not loaded', () => {
    // null would mean "every club". An unresolved viewer must manage none.
    expect(managedClubIds({ isAdmin: false, userWithRoles: null })).toEqual(new Set());
  });
});

describe('filterManagedShows', () => {
  const shows = [
    { id: 's1', clubId: 'club-1' },
    { id: 's2', clubId: 'club-2' },
    { id: 's3', clubId: undefined },
  ];

  it('passes every show through for a site admin', () => {
    expect(filterManagedShows(shows, null).map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });

  it('keeps only shows owned by a managed club', () => {
    expect(filterManagedShows(shows, new Set(['club-1'])).map(s => s.id)).toEqual(['s1']);
  });

  it('drops a show whose club has not loaded rather than assuming ownership', () => {
    expect(filterManagedShows(shows, new Set(['club-1', 'club-2'])).map(s => s.id)).toEqual([
      's1',
      's2',
    ]);
  });

  it('returns nothing when the viewer manages no club', () => {
    expect(filterManagedShows(shows, new Set())).toEqual([]);
  });
});
