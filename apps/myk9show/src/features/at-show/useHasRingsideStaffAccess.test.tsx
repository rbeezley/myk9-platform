import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserRole } from '@/types/auth-types';
import { useHasRingsideStaffAccess } from './useHasRingsideStaffAccess';

let mockRoles: UserRole[] = [];
let mockGrantRole: 'judge' | 'steward' | null = null;

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: (role: UserRole) => mockRoles.includes(role) }),
}));
vi.mock('./useRehydrateRingsideGrant', () => ({
  useRehydrateRingsideGrant: () => mockGrantRole,
}));

const access = () => renderHook(() => useHasRingsideStaffAccess('show-1')).result.current;

describe('useHasRingsideStaffAccess (MYK9-1544)', () => {
  beforeEach(() => {
    mockRoles = [];
    mockGrantRole = null;
  });

  it.each([UserRole.JUDGE, UserRole.STEWARD, UserRole.SECRETARY])(
    'admits an account holding the %s role',
    role => {
      mockRoles = [role];
      expect(access()).toBe(true);
    }
  );

  it('admits a passcode grant for the show', () => {
    mockGrantRole = 'judge';
    expect(access()).toBe(true);
  });

  it('does not admit an exhibitor or a stranger', () => {
    mockRoles = [UserRole.EXHIBITOR];
    expect(access()).toBe(false);
  });
});
