import { describe, it, expect } from 'vitest';
import { getPrimaryRole } from './AuthContext';
import { UserRole } from '@/types/auth-types';

// getPrimaryRole is not exercised directly by src/test/auth/AuthContext.test.tsx
// (which covers AuthProvider/ProtectedRoute end-to-end) or
// src/test/auth/authScopeMapping.test.ts (buildActiveRoleScopes /
// getUniqueActiveRoleNames only). Its logic is a near-duplicate of
// hooks/getHighestRole.ts (same USER_ROLE_HIERARCHY walk, same
// EXHIBITOR fallback) — see the report for the duplication note.
describe('getPrimaryRole', () => {
  it.each<[string, UserRole[], UserRole]>([
    ['empty roles -> defaults to EXHIBITOR', [], UserRole.EXHIBITOR],
    ['single EXHIBITOR', [UserRole.EXHIBITOR], UserRole.EXHIBITOR],
    ['single STEWARD', [UserRole.STEWARD], UserRole.STEWARD],
    ['single JUDGE', [UserRole.JUDGE], UserRole.JUDGE],
    ['single SECRETARY', [UserRole.SECRETARY], UserRole.SECRETARY],
    ['single SITE_ADMIN', [UserRole.SITE_ADMIN], UserRole.SITE_ADMIN],
    [
      'SITE_ADMIN outranks every other role held simultaneously',
      [UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.SITE_ADMIN],
      UserRole.SITE_ADMIN,
    ],
    [
      'SECRETARY outranks JUDGE and CLUB_ADMIN',
      [UserRole.CLUB_ADMIN, UserRole.JUDGE, UserRole.SECRETARY],
      UserRole.SECRETARY,
    ],
    [
      'JUDGE outranks CLUB_ADMIN, CHAIRMAN, STEWARD, EXHIBITOR',
      [
        UserRole.EXHIBITOR,
        UserRole.STEWARD,
        UserRole.CHAIRMAN,
        UserRole.CLUB_ADMIN,
        UserRole.JUDGE,
      ],
      UserRole.JUDGE,
    ],
    [
      'CLUB_ADMIN outranks CHAIRMAN and STEWARD',
      [UserRole.STEWARD, UserRole.CHAIRMAN, UserRole.CLUB_ADMIN],
      UserRole.CLUB_ADMIN,
    ],
    ['CHAIRMAN outranks STEWARD', [UserRole.STEWARD, UserRole.CHAIRMAN], UserRole.CHAIRMAN],
    ['STEWARD outranks EXHIBITOR', [UserRole.EXHIBITOR, UserRole.STEWARD], UserRole.STEWARD],
  ])('%s', (_label, roles, expected) => {
    expect(getPrimaryRole(roles)).toBe(expected);
  });
});
