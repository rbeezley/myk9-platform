import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import {
  ScopeType,
  UserRole,
  type RoleScope,
  type UserWithRoles,
} from '@/types/auth-types';
import { hasRingsideAccountShowAccess } from './ringsideAccountAccess';

function makeScope(
  roleId: UserRole,
  scopeType: ScopeType,
  scopeId: string
): RoleScope {
  return {
    userId: 'user-1',
    roleId,
    scopeType,
    scopeId,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function makeUser(roles: UserRole[], scopes: RoleScope[]): UserWithRoles {
  return fromAny<UserWithRoles, unknown>({
    id: 'user-1',
    roles,
    permissions: [],
    scopes,
  });
}

function hasRoleFrom(roles: UserRole[]) {
  return (role: UserRole) => roles.includes(role);
}

describe('hasRingsideAccountShowAccess', () => {
  it('keeps club staff scoped to their own club shows', () => {
    const roles = [UserRole.CLUB_ADMIN];
    const user = makeUser(
      roles,
      [makeScope(UserRole.CLUB_ADMIN, ScopeType.CLUB, 'club-a')]
    );
    const shows = [
      { id: 'own-show', clubId: 'club-a' },
      { id: 'unrelated-public-show', clubId: 'club-b' },
    ];

    expect(
      shows
        .filter(show => hasRingsideAccountShowAccess(user, hasRoleFrom(roles), show))
        .map(show => show.id)
    ).toEqual(['own-show']);
  });

  it('admits a show-scoped official only to the assigned show', () => {
    const roles = [UserRole.SECRETARY];
    const user = makeUser(
      roles,
      [makeScope(UserRole.SECRETARY, ScopeType.SHOW, 'assigned-show')]
    );

    expect(
      hasRingsideAccountShowAccess(user, hasRoleFrom(roles), {
        id: 'assigned-show',
        clubId: 'club-a',
      })
    ).toBe(true);
    expect(
      hasRingsideAccountShowAccess(user, hasRoleFrom(roles), {
        id: 'other-show',
        clubId: 'club-a',
      })
    ).toBe(false);
  });

  it('does not treat an unscoped staff role as access to every public show', () => {
    const roles = [UserRole.STEWARD];
    const user = makeUser(roles, []);

    expect(
      hasRingsideAccountShowAccess(user, hasRoleFrom(roles), {
        id: 'public-show',
        clubId: 'club-a',
      })
    ).toBe(false);
  });

  it('retains global site-admin access', () => {
    const roles = [UserRole.SITE_ADMIN];
    const user = makeUser(roles, []);

    expect(
      hasRingsideAccountShowAccess(user, hasRoleFrom(roles), {
        id: 'any-show',
        clubId: 'any-club',
      })
    ).toBe(true);
  });

  it('leaves judge access to the assignment source', () => {
    const roles = [UserRole.JUDGE];
    const user = makeUser(roles, []);

    expect(
      hasRingsideAccountShowAccess(user, hasRoleFrom(roles), {
        id: 'public-show',
        clubId: 'club-a',
      })
    ).toBe(false);
  });
});
