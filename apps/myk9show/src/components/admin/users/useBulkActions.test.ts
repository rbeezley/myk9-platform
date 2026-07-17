import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { ErrorWithRelatedData } from './BulkActionsBar.types';

const deleteUserMutateAsync = vi.fn();
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeleteUserMutation: () => ({
    mutateAsync: (...args: unknown[]) => deleteUserMutateAsync(...args),
  }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));

import { useBulkActions } from './useBulkActions';

function selectedUser(id: string, firstName: string): SelectedUser {
  return {
    id,
    user: {
      id,
      firstName,
      lastName: 'Test',
      email: `${id}@example.com`,
      roles: [UserRole.EXHIBITOR],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

function mk001Error(): Error {
  const error = new Error('people_owns_dogs_guard') as Error & { code?: string };
  error.code = 'MK001';
  return error;
}

function hasRelatedDataError(entryCount: number, dogCount: number): ErrorWithRelatedData {
  const error = new Error('has related data') as ErrorWithRelatedData;
  error.code = 'HAS_RELATED_DATA';
  error.details = { entryCount, dogCount, canCascade: true };
  return error;
}

describe('useBulkActions — no simulated bulk role/status action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes only real bulk actions (delete/cascade/permanent) — no broken role or status action', () => {
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }));

    expect(result.current).not.toHaveProperty('handleBulkRoleAction');
    expect(result.current).not.toHaveProperty('handleRoleSelection');
    expect(result.current).not.toHaveProperty('roleData');
    expect(result.current).not.toHaveProperty('setRoleData');
    expect(result.current).not.toHaveProperty('handleBulkStatusAction');
    expect(result.current).not.toHaveProperty('statusData');
    expect(result.current).not.toHaveProperty('setStatusData');

    expect(typeof result.current.handleBulkDelete).toBe('function');
    expect(typeof result.current.handleCascadeDelete).toBe('function');
    expect(typeof result.current.handleBulkPermanentDelete).toBe('function');
  });
});

describe('useBulkActions — bulk delete MK001 reason mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the owns-registered-dogs reason for a person blocked by the MK001 guard', async () => {
    deleteUserMutateAsync.mockResolvedValueOnce(undefined).mockRejectedValueOnce(mk001Error());
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const onBulkComplete = vi.fn();
    const onUsersDeleted = vi.fn();
    const { result } = renderHook(() =>
      useBulkActions({ selectedUsers, onBulkComplete, onUsersDeleted })
    );

    await act(async () => {
      await result.current.handleBulkDelete();
    });

    // Human-readable reason, not the raw SQLSTATE or trigger message.
    expect(result.current.error).toMatch(/Bob Test: owns registered dogs/);
    expect(result.current.error).not.toMatch(/MK001/);
    expect(result.current.error).not.toMatch(/people_owns_dogs_guard/);
    // The unblocked user still deletes — a partial failure isn't a full abort.
    expect(onUsersDeleted).toHaveBeenCalledWith(['u1']);
    expect(onBulkComplete).toHaveBeenCalled();
  });

  it('reports every blocked person when the whole batch is owns-dogs blocked', async () => {
    deleteUserMutateAsync.mockRejectedValue(mk001Error());
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const onUsersDeleted = vi.fn();
    const { result } = renderHook(() =>
      useBulkActions({ selectedUsers, onBulkComplete: vi.fn(), onUsersDeleted })
    );

    await act(async () => {
      await result.current.handleBulkDelete();
    });

    expect(result.current.error).toMatch(/Alice Test: owns registered dogs/);
    expect(result.current.error).toMatch(/Bob Test: owns registered dogs/);
    expect(onUsersDeleted).not.toHaveBeenCalled();
    // The confirm dialog doesn't render `error`, so a persistent toast is the only
    // surface that tells the admin why nothing was deleted (Codex round 6).
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/owns registered dogs/));
  });

  it('does not confuse MK001 with the HAS_RELATED_DATA cascade path', async () => {
    deleteUserMutateAsync.mockRejectedValue(mk001Error());
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }));

    await act(async () => {
      await result.current.handleBulkDelete();
    });

    expect(result.current.currentDialog).not.toBe('cascadeConfirm');
    expect(result.current.cascadeData).toBeNull();
  });

  it('still surfaces owns-dogs-blocked users when the batch ALSO needs a cascade', async () => {
    // u1 -> HAS_RELATED_DATA (opens cascade), u2 -> MK001 (owns dogs, no cascade override).
    // Regression: the needsCascade branch used to return before reporting MK001 users,
    // silently dropping u2 from the operator's view.
    deleteUserMutateAsync.mockImplementation(({ id }: { id: string }) => {
      if (id === 'u1') return Promise.reject(hasRelatedDataError(3, 1));
      if (id === 'u2') return Promise.reject(mk001Error());
      return Promise.resolve();
    });
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }));

    await act(async () => {
      await result.current.handleBulkDelete();
    });

    // Cascade dialog opens for the HAS_RELATED_DATA user…
    expect(result.current.currentDialog).toBe('cascadeConfirm');
    expect(result.current.cascadeData?.userIds).toEqual(['u1']);
    // …and the MK001-blocked user is preserved for reporting, not dropped.
    expect(result.current.cascadeData?.ownsDogsBlocked).toEqual([
      { userId: 'u2', label: 'Bob Test' },
    ]);
    expect(result.current.error).toMatch(/Bob Test: owns registered dogs/);
    expect(result.current.error).not.toMatch(/MK001/);
  });
});
