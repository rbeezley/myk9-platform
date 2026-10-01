/**
 * MYK9-820 (round-3 finding #1): after a bulk role write, a reselect of the same
 * people must plan from FRESH assignments, so the cached `bulk-role-assignments`
 * read has to be invalidated — on full success, and on a partial success whose
 * succeeded subset already changed.
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkRolePlan } from './bulkRolePlanner';

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const executePersonPlan = vi.hoisted(() => vi.fn());
vi.mock('./bulkRoleRunner', () => ({ executePersonPlan }));
vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: { getAllRoles: vi.fn().mockResolvedValue([{ name: 'judge' }]) },
}));

import { useBulkActions } from './useBulkActions';

const plan: BulkRolePlan = {
  people: [
    { userId: 'u1', remove: [], add: [{ role: 'judge', clubId: null }] },
    { userId: 'u2', remove: [], add: [{ role: 'judge', clubId: null }] },
  ],
  leftUnchanged: [],
};

describe('bulk role edit refreshes the cached assignments', () => {
  let client: QueryClient;
  let invalidate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    invalidate = vi.spyOn(client, 'invalidateQueries');
  });

  function render() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useBulkActions({ selectedUsers: [], onBulkComplete: vi.fn() }), {
      wrapper,
    });
  }

  it('invalidates bulk-role-assignments on full success', async () => {
    executePersonPlan.mockResolvedValue(undefined);
    const { result } = render();
    await act(async () => {
      await result.current.handleBulkRoleEdit(plan);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bulk-role-assignments'] });
  });

  it('invalidates bulk-role-assignments when only some people succeeded', async () => {
    executePersonPlan.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('boom'));
    const { result } = render();
    await act(async () => {
      await result.current.handleBulkRoleEdit(plan);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bulk-role-assignments'] });
  });
});
