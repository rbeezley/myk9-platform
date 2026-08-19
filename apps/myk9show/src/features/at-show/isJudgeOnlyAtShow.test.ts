import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { isJudgeOnlyAtShow } from './isJudgeOnlyAtShow';

const withRoles = (...roles: UserRole[]) => ({
  isAnonymous: false,
  hasRole: (role: UserRole) => roles.includes(role),
});

describe('isJudgeOnlyAtShow', () => {
  it('is true for a plain judge', () => {
    expect(isJudgeOnlyAtShow(withRoles(UserRole.JUDGE))).toBe(true);
  });

  it.each([
    UserRole.SITE_ADMIN,
    UserRole.SECRETARY,
    UserRole.CLUB_ADMIN,
    UserRole.CHAIRMAN,
    UserRole.STEWARD,
  ])('is false for a judge who also holds %s — they get the full picker', role => {
    expect(isJudgeOnlyAtShow(withRoles(UserRole.JUDGE, role))).toBe(false);
  });

  it('is false for a non-judge', () => {
    expect(isJudgeOnlyAtShow(withRoles(UserRole.EXHIBITOR))).toBe(false);
  });

  it('is false for an anonymous passcode session even with the judge role', () => {
    expect(isJudgeOnlyAtShow({ isAnonymous: true, hasRole: () => true })).toBe(false);
  });
});
