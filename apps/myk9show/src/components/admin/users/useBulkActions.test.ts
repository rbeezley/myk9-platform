import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { useBulkActions } from './useBulkActions';

function renderBulkActions(options: Parameters<typeof useBulkActions>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return renderHook((props: Parameters<typeof useBulkActions>[0]) => useBulkActions(props), {
    wrapper,
    initialProps: options,
  });
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

describe('useBulkActions — role editing (MYK9-820, MYK9-835)', () => {
  it('exposes the role-edit action and no delete dispatch of its own', () => {
    const { result } = renderBulkActions({
      selectedUsers: [selectedUser('u1', 'Alice')],
      onBulkComplete: vi.fn(),
    });

    expect(typeof result.current.handleBulkRoleEdit).toBe('function');
    expect(result.current.isRoleProcessing).toBe(false);
    expect(result.current.roleError).toBeNull();
    // Bulk delete is the shared DeleteObjectDialog (CRUD standard Phase 2): the
    // hook keeps no second delete path that could run without that dialog.
    expect(result.current).not.toHaveProperty('handleBulkDelete');
    expect(result.current).not.toHaveProperty('handleCascadeDelete');
    expect(result.current).not.toHaveProperty('handleBulkPermanentDelete');
  });
});
