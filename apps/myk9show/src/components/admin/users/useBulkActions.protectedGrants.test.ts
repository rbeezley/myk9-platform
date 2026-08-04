import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { BulkRoleSubmitConfig } from './BulkRoleDialog';

const getAllRolesMock = vi.hoisted(() => vi.fn());
const ensureUserHasRoleMock = vi.hoisted(() => vi.fn());
const revokeRoleMock = vi.hoisted(() => vi.fn());
const revokeUserRoleMock = vi.hoisted(() => vi.fn());
const activeAssignmentsMock = vi.hoisted(() => vi.fn());
const activeAssignmentsSelectMock = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));
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
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: (...args: unknown[]) => {
        activeAssignmentsSelectMock(...args);
        return {
          eq: vi.fn(() => ({
            eq: vi.fn(() => activeAssignmentsMock()),
          })),
        };
      },
    })),
  },
}));

import { useBulkActions } from './useBulkActions';

function renderBulkActions(selectedUsers: SelectedUser[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useBulkActions({ selectedUsers, onBulkComplete: vi.fn() }), { wrapper });
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

function role(name: string) {
  return { id: name, name };
}

function config(overrides: Partial<BulkRoleSubmitConfig>): BulkRoleSubmitConfig {
  return { mode: 'replace', roleNames: ['steward'], clubIds: [], ...overrides };
}

describe('useBulkActions — protected role grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeAssignmentsMock.mockResolvedValue({ data: [], error: null });
    ensureUserHasRoleMock.mockResolvedValue(true);
    revokeRoleMock.mockResolvedValue(true);
    revokeUserRoleMock.mockResolvedValue(undefined);
  });

  it('keeps a show-scoped grant out of Replace revokes and names the affected person', async () => {
    getAllRolesMock.mockResolvedValue([role('judge'), role('steward'), role('exhibitor')]);
    activeAssignmentsMock.mockResolvedValue({
      data: [
        {
          id: 'ur-judge-show',
          role_id: 'judge',
          club_id: null,
          show_id: 'show-9',
          expires_at: null,
          roles: { name: 'judge' },
        },
        {
          id: 'ur-judge-ordinary',
          role_id: 'judge',
          club_id: null,
          show_id: null,
          expires_at: null,
          roles: { name: 'judge' },
        },
      ],
      error: null,
    });
    const { result } = renderBulkActions([selectedUser('u1', 'Alice')]);

    await act(async () => {
      await result.current.handleBulkRoleChange(config({}));
    });

    expect(activeAssignmentsSelectMock).toHaveBeenCalledWith(
      'id, role_id, club_id, show_id, expires_at, roles(name)'
    );
    expect(revokeUserRoleMock).not.toHaveBeenCalledWith('ur-judge-show');
    expect(revokeUserRoleMock).toHaveBeenCalledWith('ur-judge-ordinary');
    expect(revokeRoleMock).not.toHaveBeenCalled();
    expect(result.current.roleNotice).toMatch(/Alice Test has a role assignment limited to a show/);
  });

  it('keeps protected grants out of Remove revokes while removing ordinary assignments', async () => {
    getAllRolesMock.mockResolvedValue([role('judge'), role('exhibitor')]);
    activeAssignmentsMock.mockResolvedValue({
      data: [
        {
          id: 'ur-judge-expiring',
          role_id: 'judge',
          club_id: null,
          show_id: null,
          expires_at: '2026-12-31T23:59:59Z',
          roles: { name: 'judge' },
        },
        {
          id: 'ur-judge-ordinary',
          role_id: 'judge',
          club_id: null,
          show_id: null,
          expires_at: null,
          roles: { name: 'judge' },
        },
      ],
      error: null,
    });
    const { result } = renderBulkActions([selectedUser('u1', 'Alice')]);

    await act(async () => {
      await result.current.handleBulkRoleChange(config({ mode: 'remove', roleNames: ['judge'] }));
    });

    expect(revokeUserRoleMock).not.toHaveBeenCalledWith('ur-judge-expiring');
    expect(revokeUserRoleMock).toHaveBeenCalledWith('ur-judge-ordinary');
    expect(revokeRoleMock).not.toHaveBeenCalled();
    expect(result.current.roleNotice).toMatch(/Alice Test has a role assignment limited to a show/);
  });

  it('keeps the protected-assignment notice when a later role mutation fails', async () => {
    getAllRolesMock.mockResolvedValue([role('judge'), role('steward'), role('exhibitor')]);
    activeAssignmentsMock.mockResolvedValue({
      data: [
        {
          id: 'ur-judge-show',
          role_id: 'judge',
          club_id: null,
          show_id: 'show-9',
          expires_at: null,
          roles: { name: 'judge' },
        },
      ],
      error: null,
    });
    ensureUserHasRoleMock.mockRejectedValue(new Error('later mutation failed'));
    const { result } = renderBulkActions([selectedUser('u1', 'Alice')]);

    await act(async () => {
      await result.current.handleBulkRoleChange(config({}));
    });

    expect(result.current.roleError).toMatch(/0 of 1 users updated — 1 failed/);
    expect(result.current.roleNotice).toMatch(/Alice Test has a role assignment limited to a show/);
  });
});
