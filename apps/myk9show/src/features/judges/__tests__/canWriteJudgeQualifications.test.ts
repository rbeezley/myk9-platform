import { describe, expect, it } from 'vitest';
import { canWriteJudgeQualifications } from '../canWriteJudgeQualifications';
import { UserRole } from '@/types/auth-types';

const as =
  (...roles: UserRole[]) =>
  (role: UserRole) =>
    roles.includes(role);

describe('canWriteJudgeQualifications (mirrors judge_qualifications_insert RLS)', () => {
  it('allows secretaries and site admins', () => {
    expect(canWriteJudgeQualifications(as(UserRole.SECRETARY))).toBe(true);
    expect(canWriteJudgeQualifications(as(UserRole.SITE_ADMIN))).toBe(true);
  });

  it.each([UserRole.CLUB_ADMIN, UserRole.JUDGE, UserRole.CHAIRMAN, UserRole.EXHIBITOR])(
    'refuses %s on its own',
    role => {
      expect(canWriteJudgeQualifications(as(role))).toBe(false);
    }
  );
});
