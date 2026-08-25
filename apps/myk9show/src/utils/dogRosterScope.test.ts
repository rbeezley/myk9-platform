import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { rosterIsOwnDogsOnlyForRoles } from './dogRosterScope';

const ALL_ROLES = Object.values(UserRole);
const allRoleSets = Array.from({ length: 2 ** ALL_ROLES.length }, (_, mask) =>
  ALL_ROLES.filter((_role, index) => (mask & (1 << index)) !== 0)
);

describe('rosterIsOwnDogsOnlyForRoles', () => {
  it.each(allRoleSets.map(roles => [roles]))('uses the same scope rule for role set %j', roles => {
    const hasFullRosterRole = roles.some(role =>
      [UserRole.SITE_ADMIN, UserRole.CLUB_ADMIN, UserRole.SECRETARY].includes(role)
    );

    expect(rosterIsOwnDogsOnlyForRoles(roles)).toBe(!hasFullRosterRole);
  });
});
