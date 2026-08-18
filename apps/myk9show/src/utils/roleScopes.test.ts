import { describe, it, expect } from 'vitest';
import { canManageShowSurface, hasScopedClubRole, hasScopedShowRole } from './roleScopes';
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

describe('canManageShowSurface', () => {
  const clubAdminUser = buildUser([clubScope]);
  const holdsClubAdmin = (role: UserRole) => role === UserRole.CLUB_ADMIN;
  const holdsNothing = () => false;

  it('grants a secretary regardless of club', () => {
    expect(
      canManageShowSurface({
        isSecretary: true,
        isAdmin: false,
        hasRole: holdsNothing,
        userWithRoles: null,
        clubId: undefined,
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
