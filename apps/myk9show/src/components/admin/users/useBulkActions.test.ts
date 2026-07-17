import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';

const ensureUserHasRole = vi.fn();
vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: { ensureUserHasRole: (...args: unknown[]) => ensureUserHasRole(...args) },
}));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

// Chainable Supabase mock: every call in a `.from(table).select()/.update()/.eq()/.in()`
// chain returns the same builder; awaiting the builder resolves to the next queued
// response for that table (FIFO), so each test controls exactly what each query returns.
type SupabaseResponse = { data: unknown; error: unknown };
const responseQueues = new Map<string, SupabaseResponse[]>();

function queueResponse(table: string, response: SupabaseResponse) {
  const queue = responseQueues.get(table) ?? [];
  queue.push(response);
  responseQueues.set(table, queue);
}

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = vi.fn(chain);
  builder.update = vi.fn(chain);
  builder.eq = vi.fn(chain);
  builder.in = vi.fn(chain);
  builder.then = (resolve: (v: SupabaseResponse) => void) => {
    const queue = responseQueues.get(table) ?? [];
    const response = queue.shift() ?? { data: [], error: null };
    resolve(response);
  };
  return builder;
}

const fromMock = vi.fn((table: string) => makeBuilder(table));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: (table: string) => fromMock(table) },
}));

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

describe('useBulkActions — bulk role dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responseQueues.clear();
  });

  it('add: calls the real ensureUserHasRole mutation for every selected user and role', async () => {
    ensureUserHasRole.mockResolvedValue(true);
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const onBulkComplete = vi.fn();

    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete }));

    act(() => {
      result.current.setRoleData({ action: 'add', roles: [UserRole.JUDGE] });
    });

    queueResponse('roles', { data: [{ id: 'role-judge', name: 'judge' }], error: null });

    await act(async () => {
      await result.current.handleBulkRoleAction();
    });

    expect(ensureUserHasRole).toHaveBeenCalledWith('u1', UserRole.JUDGE);
    expect(ensureUserHasRole).toHaveBeenCalledWith('u2', UserRole.JUDGE);
    expect(ensureUserHasRole).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(onBulkComplete).toHaveBeenCalled());
  });

  it('remove: deactivates the role via user_roles.update when currently active, skips otherwise', async () => {
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }));

    act(() => {
      result.current.setRoleData({ action: 'remove', roles: [UserRole.JUDGE] });
    });

    queueResponse('roles', { data: [{ id: 'role-judge', name: 'judge' }], error: null });
    // Only u1 currently has the role active.
    queueResponse('user_roles', {
      data: [{ user_id: 'u1', role_id: 'role-judge' }],
      error: null,
    });
    queueResponse('user_roles', { data: null, error: null }); // the u1 deactivate write

    await act(async () => {
      await result.current.handleBulkRoleAction();
    });

    const updateCalls = fromMock.mock.results
      .map(r => r.value as ReturnType<typeof makeBuilder>)
      .filter(builder => (builder.update as ReturnType<typeof vi.fn>).mock.calls.length > 0);
    expect(updateCalls).toHaveLength(1);
  });

  it('leaves currentDialog set and reports an error when part of the batch fails', async () => {
    ensureUserHasRole.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('rbac down'));
    const selectedUsers = [selectedUser('u1', 'Alice'), selectedUser('u2', 'Bob')];
    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }));

    act(() => {
      result.current.setCurrentDialog('role');
      result.current.setRoleData({ action: 'add', roles: [UserRole.JUDGE] });
    });

    queueResponse('roles', { data: [{ id: 'role-judge', name: 'judge' }], error: null });

    await act(async () => {
      await result.current.handleBulkRoleAction();
    });

    expect(result.current.error).toMatch(/1 of 2 users failed/);
    // Dialog stays open on partial failure so the admin can see the error and retry.
    expect(result.current.currentDialog).toBe('role');
  });

  it('requires at least one role to be selected', async () => {
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }));

    act(() => {
      result.current.setRoleData({ action: 'add', roles: [] });
    });

    await act(async () => {
      await result.current.handleBulkRoleAction();
    });

    expect(ensureUserHasRole).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/select at least one role/i);
  });

  it('has no bulk status action or status state (stub removed, no real mutation exists)', () => {
    const selectedUsers = [selectedUser('u1', 'Alice')];
    const { result } = renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }));

    expect(result.current).not.toHaveProperty('handleBulkStatusAction');
    expect(result.current).not.toHaveProperty('statusData');
    expect(result.current).not.toHaveProperty('setStatusData');
  });
});
