import { describe, it, expect } from 'vitest';
import { hasScopedClubRole, hasScopedShowRole } from '@/utils/roleScopes';
import { ScopeType, UserRole, type UserWithRoles, type RoleScope } from '@/types/auth-types';
import { fromAny } from '@total-typescript/shoehorn';

function makeScope(overrides: Partial<RoleScope>): RoleScope {
  return {
    userId: 'user-1',
    roleId: UserRole.CLUB_ADMIN,
    scopeType: ScopeType.CLUB,
    scopeId: 'club-a',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeUser(scopes: RoleScope[]): UserWithRoles {
  return fromAny<UserWithRoles, unknown>({
    id: 'user-1',
    email: 'admin@example.com',
    roles: [UserRole.CLUB_ADMIN],
    permissions: [],
    scopes,
  });
}

describe('hasScopedClubRole', () => {
  it('returns true when the user holds the role scoped to the given club', () => {
    const user = makeUser([makeScope({ scopeId: 'club-a', roleId: UserRole.CLUB_ADMIN })]);
    expect(hasScopedClubRole(user, UserRole.CLUB_ADMIN, 'club-a')).toBe(true);
  });

  it('returns false for a different club — the core privilege-escalation guard', () => {
    // A Club A admin must NOT be treated as an admin of Club B.
    const user = makeUser([makeScope({ scopeId: 'club-a', roleId: UserRole.CLUB_ADMIN })]);
    expect(hasScopedClubRole(user, UserRole.CLUB_ADMIN, 'club-b')).toBe(false);
  });

  it('returns false when the clubId is undefined', () => {
    const user = makeUser([makeScope({ scopeId: 'club-a' })]);
    expect(hasScopedClubRole(user, UserRole.CLUB_ADMIN, undefined)).toBe(false);
  });

  it('returns false when the role differs at the same club', () => {
    const user = makeUser([makeScope({ scopeId: 'club-a', roleId: UserRole.SECRETARY })]);
    expect(hasScopedClubRole(user, UserRole.CLUB_ADMIN, 'club-a')).toBe(false);
  });

  it('returns false when the scope is a show scope, not a club scope', () => {
    const user = makeUser([
      makeScope({ scopeType: ScopeType.SHOW, scopeId: 'club-a', roleId: UserRole.CLUB_ADMIN }),
    ]);
    expect(hasScopedClubRole(user, UserRole.CLUB_ADMIN, 'club-a')).toBe(false);
  });

  it('returns false for a null/undefined user or empty scopes', () => {
    expect(hasScopedClubRole(null, UserRole.CLUB_ADMIN, 'club-a')).toBe(false);
    expect(hasScopedClubRole(undefined, UserRole.CLUB_ADMIN, 'club-a')).toBe(false);
    expect(hasScopedClubRole(makeUser([]), UserRole.CLUB_ADMIN, 'club-a')).toBe(false);
  });
});

describe('hasScopedShowRole', () => {
  it('returns true when the user holds the role scoped to the given show', () => {
    const user = makeUser([
      makeScope({ scopeType: ScopeType.SHOW, scopeId: 'show-1', roleId: UserRole.SECRETARY }),
    ]);
    expect(hasScopedShowRole(user, UserRole.SECRETARY, 'show-1')).toBe(true);
  });

  it('returns false for a different show', () => {
    const user = makeUser([
      makeScope({ scopeType: ScopeType.SHOW, scopeId: 'show-1', roleId: UserRole.SECRETARY }),
    ]);
    expect(hasScopedShowRole(user, UserRole.SECRETARY, 'show-2')).toBe(false);
  });

  it('returns false when the showId is undefined', () => {
    const user = makeUser([makeScope({ scopeType: ScopeType.SHOW, scopeId: 'show-1' })]);
    expect(hasScopedShowRole(user, UserRole.SECRETARY, undefined)).toBe(false);
  });

  it('does not match a club scope when asked for a show scope', () => {
    const user = makeUser([
      makeScope({ scopeType: ScopeType.CLUB, scopeId: 'show-1', roleId: UserRole.SECRETARY }),
    ]);
    expect(hasScopedShowRole(user, UserRole.SECRETARY, 'show-1')).toBe(false);
  });
});
