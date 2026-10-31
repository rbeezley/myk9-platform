import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { UserRole } from '@/types/auth-types';
import { useHasRingsideStaffAccess } from './useHasRingsideStaffAccess';

let mockRoles: UserRole[] = [];
let mockScopes: Array<{ scopeType: string; scopeId: string; roleId: string }> = [];
let mockGrantRole: 'judge' | 'steward' | null = null;
let mockAssignments = { assignedClassIds: new Set<string>(), isUnknown: false };

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: (role: UserRole) => mockRoles.includes(role),
    userWithRoles: { scopes: mockScopes },
  }),
}));
vi.mock('./useRehydrateRingsideGrant', () => ({
  useRehydrateRingsideGrant: () => mockGrantRole,
}));
vi.mock('./useMyAtShowJudgeAssignments', () => ({
  useMyAtShowJudgeAssignments: () => mockAssignments,
}));

const access = (showId = 'show-1') =>
  renderHook(() => useHasRingsideStaffAccess(showId, 'club-1')).result.current;

describe('useHasRingsideStaffAccess (MYK9-1544)', () => {
  beforeEach(() => {
    mockRoles = [];
    mockScopes = [];
    mockGrantRole = null;
    mockAssignments = { assignedClassIds: new Set(), isUnknown: false };
  });

  it('admits a passcode grant for the show', () => {
    mockGrantRole = 'judge';
    expect(access()).toBe(true);
  });

  it('admits a steward scoped to this show', () => {
    mockRoles = [UserRole.STEWARD];
    mockScopes = [{ scopeType: 'show', scopeId: 'show-1', roleId: UserRole.STEWARD }];
    expect(access()).toBe(true);
  });

  it('does not admit a steward scoped to a different show', () => {
    mockRoles = [UserRole.STEWARD];
    mockScopes = [{ scopeType: 'show', scopeId: 'show-2', roleId: UserRole.STEWARD }];
    expect(access()).toBe(false);
  });

  it('admits a judge assigned to classes in this show', () => {
    mockRoles = [UserRole.JUDGE];
    mockAssignments = { assignedClassIds: new Set(['c1']), isUnknown: false };
    expect(access()).toBe(true);
  });

  it('does not admit a judge with no assignment in this show', () => {
    mockRoles = [UserRole.JUDGE];
    expect(access()).toBe(false);
  });

  it('admits a judge whose assignments cannot be known yet', () => {
    mockRoles = [UserRole.JUDGE];
    mockAssignments = { assignedClassIds: new Set(), isUnknown: true };
    expect(access()).toBe(true);
  });

  it('does not admit an exhibitor', () => {
    mockRoles = [UserRole.EXHIBITOR];
    expect(access()).toBe(false);
  });
});
