import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { ErrorWithRelatedData } from './BulkActionsBar.types';
import type { BulkRoleSubmitConfig } from './BulkRoleDialog';

const deleteUserMutateAsync = vi.fn();
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeleteUserMutation: () => ({
    mutateAsync: (...args: unknown[]) => deleteUserMutateAsync(...args),
  }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

const toastErrorMock = vi.hoisted(() => vi.fn());
const toastSuccessMock = vi.hoisted(() => vi.fn());
const toastInfoMock = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock, info: toastInfoMock },
}));

const getAllRolesMock = vi.hoisted(() => vi.fn());
const ensureUserHasRoleMock = vi.hoisted(() => vi.fn());
const revokeRoleMock = vi.hoisted(() => vi.fn());
const revokeUserRoleMock = vi.hoisted(() => vi.fn());
vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: (...args: unknown[]) => getAllRolesMock(...args),
    ensureUserHasRole: (...args: unknown[]) => ensureUserHasRoleMock(...args),
    revokeRole: (...args: unknown[]) => revokeRoleMock(...args),
    revokeUserRole: (...args: unknown[]) => revokeUserRoleMock(...args),
    clearAllCache: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

// Active-assignments lookup used by Replace mode (bulkRoleRunner.ts).
const activeAssignmentsMock = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ data: [] as unknown[], error: null }))
);
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => activeAssignmentsMock()),
        })),
      })),
    })),
  },
}));

import { useBulkActions } from './useBulkActions';

function renderBulkActions(options: Parameters<typeof useBulkActions>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  // initialProps + a props-taking callback so tests can `rerender` with a fresh
  // `selectedUsers` list to simulate the current admin list changing between an
  // initial dispatch and a retry.
  return renderHook((props: Parameters<typeof useBulkActions>[0]) => useBulkActions(props), {
    wrapper,
    initialProps: options,
  });
}

function role(name: string, id = name): { id: string; name: string } {
  return { id, name };
}

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

describe('useBulkActions — no simulated bulk status action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes real bulk actions (delete/cascade/permanent/role) — no broken status action', () => {
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    expect(result.current).not.toHaveProperty('handleBulkStatusAction');
    expect(result.current).not.toHaveProperty('statusData');
    expect(result.current).not.toHaveProperty('setStatusData');

    expect(typeof result.current.handleBulkDelete).toBe('function');
    expect(typeof result.current.handleCascadeDelete).toBe('function');
    expect(typeof result.current.handleBulkPermanentDelete).toBe('function');
    expect(typeof result.current.handleBulkRoleChange).toBe('function');
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
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete, onUsersDeleted });

    await act(async () => {
      await result.current.handleBulkDelete();
    });

    // Human-readable reason, not the raw SQLSTATE or trigger message.
    expect(result.current.error).toMatch(/Bob Test: owns registered dogs/);
    expect(result.current.error).not.toMatch(/MK001/);
    expect(result.current.error).not.toMatch(/people_owns_dogs_guard/);
    // The unblocked user still deletes — a partial failure isn't a full abort.
    expect(onUsersDeleted).toHaveBeenCalledWith(['u1']);
    expect(onBulkComplete).toHaveBeenCalledWith(['u1']);
  });

  it('reports every blocked person when the whole batch is owns-dogs blocked', async () => {
    deleteUserMutateAsync.mockRejectedValue(mk001Error());
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const onUsersDeleted = vi.fn();
    const { result } = renderBulkActions({
      selectedUsers,
      onBulkComplete: vi.fn(),
      onUsersDeleted,
    });

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
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

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
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

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

  it('reports only cascade successes so MK001 users remain selected', async () => {
    let cascadeConfirmed = false;
    deleteUserMutateAsync.mockImplementation(({ id }: { id: string }) => {
      if (!cascadeConfirmed && id === 'u1') return Promise.reject(hasRelatedDataError(2, 1));
      if (!cascadeConfirmed && id === 'u2') return Promise.reject(mk001Error());
      return Promise.resolve();
    });
    const onBulkComplete = vi.fn();
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete });

    await act(async () => {
      await result.current.handleBulkDelete();
    });
    expect(result.current.currentDialog).toBe('cascadeConfirm');

    cascadeConfirmed = true;
    await act(async () => {
      await result.current.handleCascadeDelete();
    });

    expect(onBulkComplete).toHaveBeenCalledWith(['u1']);
    expect(onBulkComplete).not.toHaveBeenCalledWith(['u1', 'u2']);
  });
});

describe('useBulkActions — handleBulkRoleChange (MYK9-58)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeAssignmentsMock.mockResolvedValue({ data: [], error: null });
    revokeUserRoleMock.mockResolvedValue(undefined);
  });

  function baseConfig(overrides: Partial<BulkRoleSubmitConfig> = {}): BulkRoleSubmitConfig {
    return { mode: 'add', roleNames: ['exhibitor'], clubIds: [], ...overrides };
  }

  it('rejects the whole batch when a role name is not canonical — no dispatch at all', async () => {
    getAllRolesMock.mockResolvedValue([role('site_admin'), role('exhibitor')]);
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    await act(async () => {
      await result.current.handleBulkRoleChange(baseConfig({ roleNames: ['admin'] }));
    });

    expect(ensureUserHasRoleMock).not.toHaveBeenCalled();
    expect(revokeRoleMock).not.toHaveBeenCalled();
    expect(result.current.roleError).toMatch(/Unknown role/);
  });

  it('carries the selected clubId on every scoped grant', async () => {
    getAllRolesMock.mockResolvedValue([role('secretary')]);
    ensureUserHasRoleMock.mockResolvedValue(true);
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    await act(async () => {
      await result.current.handleBulkRoleChange(
        baseConfig({ roleNames: ['secretary'], clubIds: ['club-1', 'club-2'] })
      );
    });

    expect(ensureUserHasRoleMock).toHaveBeenCalledWith('u1', 'secretary', { clubId: 'club-1' });
    expect(ensureUserHasRoleMock).toHaveBeenCalledWith('u1', 'secretary', { clubId: 'club-2' });
    expect(result.current.roleError).toBeNull();
  });

  it('treats ensureUserHasRole returning false as a no-op skip, not a failure', async () => {
    getAllRolesMock.mockResolvedValue([role('exhibitor')]);
    ensureUserHasRoleMock.mockResolvedValue(false); // "already has this role"
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    await act(async () => {
      await result.current.handleBulkRoleChange(baseConfig());
    });

    expect(result.current.roleError).toBeNull();
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it('reports a thrown error as an honest partial failure naming the count', async () => {
    getAllRolesMock.mockResolvedValue([role('exhibitor')]);
    ensureUserHasRoleMock.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('boom'));
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    await act(async () => {
      await result.current.handleBulkRoleChange(baseConfig());
    });

    expect(result.current.roleError).toMatch(/1 of 2 users updated — 1 failed/);
  });

  it('replace validates the target roles, revokes non-locked roles not in the target set, and preserves exhibitor', async () => {
    getAllRolesMock.mockResolvedValue([role('secretary'), role('judge'), role('exhibitor')]);
    activeAssignmentsMock.mockResolvedValue({
      data: [
        { id: 'ur1', role_id: 'r-exhibitor', club_id: null, roles: { name: 'exhibitor' } },
        { id: 'ur2', role_id: 'r-judge', club_id: null, roles: { name: 'judge' } },
      ],
      error: null,
    });
    ensureUserHasRoleMock.mockResolvedValue(true);
    revokeRoleMock.mockResolvedValue(true);
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    await act(async () => {
      await result.current.handleBulkRoleChange(
        baseConfig({ mode: 'replace', roleNames: ['secretary'], clubIds: ['club-1'] })
      );
    });

    // judge is non-locked and not in the target set — revoked.
    expect(revokeUserRoleMock).toHaveBeenCalledWith('ur2');
    // exhibitor is locked — never revoked even though it isn't in the target set.
    expect(revokeUserRoleMock).not.toHaveBeenCalledWith('ur1');
    // Target role granted with the chosen club.
    expect(ensureUserHasRoleMock).toHaveBeenCalledWith('u1', 'secretary', { clubId: 'club-1' });
    expect(result.current.roleError).toBeNull();
  });

  it('replace revokes a legacy global club-scoped role before adding selected club scopes', async () => {
    getAllRolesMock.mockResolvedValue([role('secretary'), role('exhibitor')]);
    activeAssignmentsMock.mockResolvedValue({
      data: [
        { id: 'ur1', role_id: 'r-secretary', club_id: null, roles: { name: 'secretary' } },
        { id: 'ur2', role_id: 'r-exhibitor', club_id: null, roles: { name: 'exhibitor' } },
      ],
      error: null,
    });
    ensureUserHasRoleMock.mockResolvedValue(true);
    revokeRoleMock.mockResolvedValue(true);
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    await act(async () => {
      await result.current.handleBulkRoleChange(
        baseConfig({ mode: 'replace', roleNames: ['secretary'], clubIds: ['club-1'] })
      );
    });

    expect(revokeUserRoleMock).toHaveBeenCalledWith('ur1');
    expect(ensureUserHasRoleMock).toHaveBeenCalledWith('u1', 'secretary', { clubId: 'club-1' });
    expect(result.current.roleError).toBeNull();
  });

  it('replace repairs a user missing the locked exhibitor role (ensures it after revoke+add)', async () => {
    getAllRolesMock.mockResolvedValue([role('judge'), role('exhibitor')]);
    // User has NO exhibitor assignment at all — only judge.
    activeAssignmentsMock.mockResolvedValue({
      data: [{ id: 'ur1', role_id: 'r-judge', club_id: null, roles: { name: 'judge' } }],
      error: null,
    });
    ensureUserHasRoleMock.mockResolvedValue(true);
    revokeRoleMock.mockResolvedValue(true);
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    await act(async () => {
      await result.current.handleBulkRoleChange(
        baseConfig({ mode: 'replace', roleNames: ['judge'], clubIds: [] })
      );
    });

    // Replace never offers exhibitor in the UI, so it's absent from roleNames —
    // the runner must still end the user with exhibitor ensured (unscoped).
    expect(ensureUserHasRoleMock).toHaveBeenCalledWith('u1', 'exhibitor');
    expect(result.current.roleError).toBeNull();
  });

  it('full success invalidates the users query family and clears the selection (list refresh, MYK9-58 Codex fix 1)', async () => {
    getAllRolesMock.mockResolvedValue([role('exhibitor')]);
    ensureUserHasRoleMock.mockResolvedValue(true);
    const onClearSelection = vi.fn();
    const onBulkComplete = vi.fn();
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
      React.createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(
      () => useBulkActions({ selectedUsers, onBulkComplete, onClearSelection }),
      { wrapper }
    );

    await act(async () => {
      await result.current.handleBulkRoleChange(baseConfig());
    });

    expect(onClearSelection).toHaveBeenCalledOnce();
    expect(onBulkComplete).toHaveBeenCalledOnce();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
  });

  it('retry skips a user no longer present in the current selection', async () => {
    getAllRolesMock.mockResolvedValue([role('exhibitor')]);
    ensureUserHasRoleMock.mockRejectedValue(new Error('transient'));
    const u1 = selectedUser('u1', 'Alice');
    const u2 = selectedUser('u2', 'Bob');
    const { result, rerender } = renderBulkActions({
      selectedUsers: [u1, u2],
      onBulkComplete: vi.fn(),
    });

    await act(async () => {
      await result.current.handleBulkRoleChange(baseConfig());
    });

    expect(toastErrorMock).toHaveBeenCalled();
    const retryAction = toastErrorMock.mock.calls[0]?.[1]?.action;
    expect(retryAction).toBeDefined();

    // Simulate u2 dropping out of the current admin list (e.g. deleted) before
    // the operator clicks "Retry failed".
    rerender({ selectedUsers: [u1], onBulkComplete: vi.fn() });

    ensureUserHasRoleMock.mockClear();
    ensureUserHasRoleMock.mockResolvedValue(true);

    await act(async () => {
      retryAction.onClick();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(ensureUserHasRoleMock).toHaveBeenCalledTimes(1);
    expect(ensureUserHasRoleMock).toHaveBeenCalledWith('u1', 'exhibitor');
    expect(toastInfoMock).toHaveBeenCalledWith(expect.stringMatching(/no longer eligible/));
  });

  it('latches duplicate concurrent dispatches — a second call while one is in flight is a no-op', async () => {
    getAllRolesMock.mockResolvedValue([role('exhibitor')]);
    let resolveEnsure: (() => void) | undefined;
    ensureUserHasRoleMock.mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          resolveEnsure = () => resolve(true);
        })
    );
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderBulkActions({ selectedUsers, onBulkComplete: vi.fn() });

    let firstDone = false;
    let secondDone = false;
    await act(async () => {
      const p1 = result.current.handleBulkRoleChange(baseConfig()).then(() => {
        firstDone = true;
      });
      const p2 = result.current.handleBulkRoleChange(baseConfig()).then(() => {
        secondDone = true;
      });
      // Let both calls reach their dispatch point before resolving the mutation.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      resolveEnsure?.();
      await Promise.all([p1, p2]);
    });

    expect(firstDone).toBe(true);
    expect(secondDone).toBe(true);
    // Only one batch actually dispatched work for the single selected user.
    expect(ensureUserHasRoleMock).toHaveBeenCalledTimes(1);
  });
});
