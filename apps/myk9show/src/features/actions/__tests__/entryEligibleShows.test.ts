import { describe, expect, it } from 'vitest';
import { filterEntryEligibleShows } from '../entryEligibleShows';
import { ScopeType, UserRole, type UserWithRoles } from '@/types/auth-types';

describe('filterEntryEligibleShows', () => {
  const shows = [
    { id: 'mine', clubId: 'club-1' },
    { id: 'other-club', clubId: 'club-2' },
    { id: 'no-club', clubId: undefined },
  ];
  const scoped = (roleId: UserRole, scopeId: string) =>
    ({ scopes: [{ scopeType: ScopeType.CLUB, scopeId, roleId }] }) as unknown as UserWithRoles;
  const rolesOf =
    (...roles: UserRole[]) =>
    (r: UserRole) =>
      roles.includes(r);

  it('keeps only shows of clubs the secretary is scoped to; a show failing the gate is excluded', () => {
    const out = filterEntryEligibleShows(shows, {
      hasRole: rolesOf(UserRole.SECRETARY),
      userWithRoles: scoped(UserRole.SECRETARY, 'club-1'),
    });
    expect(out.map(s => s.id)).toEqual(['mine']);
  });

  it('excludes a club admin who is not a trial secretary', () => {
    const out = filterEntryEligibleShows(shows, {
      hasRole: rolesOf(UserRole.CLUB_ADMIN),
      userWithRoles: scoped(UserRole.CLUB_ADMIN, 'club-1'),
    });
    expect(out).toEqual([]);
  });

  it('gives a site admin every show', () => {
    const out = filterEntryEligibleShows(shows, {
      hasRole: rolesOf(UserRole.SITE_ADMIN),
      userWithRoles: null,
    });
    expect(out).toHaveLength(3);
  });
});
