import { describe, it, expect } from 'vitest';
import { getHighestRole } from './getHighestRole';
import { UserRole } from '@/types/auth-types';

/**
 * Decision table: role-set -> highest-privilege role.
 * Hierarchy per getHighestRole.ts comment and USER_ROLE_HIERARCHY:
 *   SITE_ADMIN > SECRETARY > JUDGE > CLUB_ADMIN > CHAIRMAN > STEWARD > EXHIBITOR
 */
describe('getHighestRole', () => {
  it.each<[string, UserRole[], UserRole]>([
    ['empty roles -> defaults to EXHIBITOR', [], UserRole.EXHIBITOR],
    ['single EXHIBITOR', [UserRole.EXHIBITOR], UserRole.EXHIBITOR],
    ['single STEWARD', [UserRole.STEWARD], UserRole.STEWARD],
    ['single CHAIRMAN', [UserRole.CHAIRMAN], UserRole.CHAIRMAN],
    ['single CLUB_ADMIN', [UserRole.CLUB_ADMIN], UserRole.CLUB_ADMIN],
    ['single JUDGE', [UserRole.JUDGE], UserRole.JUDGE],
    ['single SECRETARY', [UserRole.SECRETARY], UserRole.SECRETARY],
    ['single SITE_ADMIN', [UserRole.SITE_ADMIN], UserRole.SITE_ADMIN],
    [
      'SITE_ADMIN beats every other role combined',
      [
        UserRole.EXHIBITOR,
        UserRole.STEWARD,
        UserRole.CHAIRMAN,
        UserRole.CLUB_ADMIN,
        UserRole.JUDGE,
        UserRole.SECRETARY,
        UserRole.SITE_ADMIN,
      ],
      UserRole.SITE_ADMIN,
    ],
    ['SECRETARY beats JUDGE and EXHIBITOR', [UserRole.EXHIBITOR, UserRole.JUDGE, UserRole.SECRETARY], UserRole.SECRETARY],
    ['JUDGE beats CLUB_ADMIN and EXHIBITOR', [UserRole.EXHIBITOR, UserRole.CLUB_ADMIN, UserRole.JUDGE], UserRole.JUDGE],
    ['CLUB_ADMIN beats CHAIRMAN and STEWARD', [UserRole.STEWARD, UserRole.CHAIRMAN, UserRole.CLUB_ADMIN], UserRole.CLUB_ADMIN],
    ['CHAIRMAN beats STEWARD and EXHIBITOR', [UserRole.EXHIBITOR, UserRole.STEWARD, UserRole.CHAIRMAN], UserRole.CHAIRMAN],
    ['STEWARD beats EXHIBITOR', [UserRole.EXHIBITOR, UserRole.STEWARD], UserRole.STEWARD],
    [
      'unrecognized role string in the array is ignored, falls through to real roles',
      [UserRole.EXHIBITOR, 'not-a-real-role' as UserRole],
      UserRole.EXHIBITOR,
    ],
  ])('%s', (_label, roles, expected) => {
    expect(getHighestRole(roles)).toBe(expected);
  });
});
