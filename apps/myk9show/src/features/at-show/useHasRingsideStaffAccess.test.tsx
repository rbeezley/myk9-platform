import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { UserRole } from '@/types/auth-types';
import { useHasRingsideStaffAccess } from './useHasRingsideStaffAccess';

let mockRoles: UserRole[] = [];
let mockScopes: Array<{ scopeType: string; scopeId: string; roleId: string }> = [];
let mockGrantRole: 'judge' | 'steward' | null = null;
let mockJudged: {
  shows: Array<{ showId: string; firstTrialDate: string | null }>;
  status: string;
} = { shows: [], status: 'known' };

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    hasRole: (role: UserRole) => mockRoles.includes(role),
    userWithRoles: { scopes: mockScopes, databaseUserId: 'person-1' },
  }),
}));
const mockSyncTable = vi.fn();
let mockJudgeTableStatus = 'success';
vi.mock('@/hooks/useReplicationSync', () => ({
  useReplicationSync: () => ({
    status: { tablesStatus: { judge_assignments: mockJudgeTableStatus } },
    syncTable: mockSyncTable,
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('./useRehydrateRingsideGrant', () => ({
  useRehydrateRingsideGrant: () => mockGrantRole,
}));
vi.mock('@/features/messages/hooks/useMyJudgedShows', () => ({
  useMyJudgedShows: () => mockJudged,
}));

const access = (showId = 'show-1') =>
  renderHook(() => useHasRingsideStaffAccess(showId, 'club-1')).result.current;

describe('useHasRingsideStaffAccess (MYK9-1544)', () => {
  beforeEach(() => {
    mockRoles = [];
    mockScopes = [];
    mockGrantRole = null;
    mockJudged = { shows: [], status: 'known' };
    mockJudgeTableStatus = 'success';
    mockSyncTable.mockReset();
    mockSyncTable.mockResolvedValue(undefined);
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
    mockJudged = { shows: [{ showId: 'show-1', firstTrialDate: null }], status: 'known' };
    expect(access()).toBe(true);
  });

  it('admits a judge whose only assignment here is show-level (no class)', () => {
    mockRoles = [UserRole.JUDGE];
    mockJudged = { shows: [{ showId: 'show-1', firstTrialDate: '2026-11-01' }], status: 'known' };
    expect(access()).toBe(true);
  });

  it('keeps the public landing for a judge assigned only at other shows', () => {
    mockRoles = [UserRole.JUDGE];
    mockJudged = { shows: [{ showId: 'show-2', firstTrialDate: null }], status: 'known' };
    expect(access()).toBe(false);
  });

  it('does not admit a judge with no assignment in this show', () => {
    mockRoles = [UserRole.JUDGE];
    expect(access()).toBe(false);
  });

  it('admits a judge whose assignments cannot be known yet', () => {
    mockRoles = [UserRole.JUDGE];
    mockJudged = { shows: [], status: 'unknown' };
    expect(access()).toBe(true);
  });

  it('does not admit an exhibitor', () => {
    mockRoles = [UserRole.EXHIBITOR];
    expect(access()).toBe(false);
  });

  it('re-syncs judge assignments once when the cached list omits this show', async () => {
    mockRoles = [UserRole.JUDGE];
    mockJudged = { shows: [{ showId: 'show-2', firstTrialDate: null }], status: 'known' };
    const { rerender } = renderHook(() => useHasRingsideStaffAccess('show-1', 'club-1'));
    await waitFor(() => expect(mockSyncTable).toHaveBeenCalledWith('judge_assignments'));
    rerender();
    expect(mockSyncTable).toHaveBeenCalledTimes(1);
  });

  it('does not re-sync when the cached list already has this show', () => {
    mockRoles = [UserRole.JUDGE];
    mockJudged = { shows: [{ showId: 'show-1', firstTrialDate: null }], status: 'known' };
    access();
    expect(mockSyncTable).not.toHaveBeenCalled();
  });
});
