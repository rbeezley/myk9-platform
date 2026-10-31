import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';

// The real get_admin_user_list row shape: no auth_user_id column.
const RPC_ROW = {
  id: 'people-1',
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane@example.com',
  phone: null,
  status: 'active',
  roles: ['exhibitor'],
  profile_image: null,
  deleted_at: null,
  deleted_by: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  last_sign_in_at: null,
};

const { mockRpc, mockEq, mockMaybeSingle } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockEq: vi.fn(),
  mockMaybeSingle: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    rpc: mockRpc,
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          mockEq(table, columns, column, value);
          return { maybeSingle: mockMaybeSingle };
        },
      }),
    }),
  },
}));

vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: ({ users }: { users: Array<{ id: string; email: string }> }) => (
    <div data-testid="user-table">
      {users.map(u => (
        <div key={u.id}>{u.email}</div>
      ))}
    </div>
  ),
}));
vi.mock('@/components/admin/users/CreateUserDialog', () => ({ CreateUserDialog: () => null }));
vi.mock('@/components/admin/users/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/panels/edit/UserEditPanel', () => ({ UserEditPanel: () => null }));
vi.mock('@/components/admin/permissions/ManageUserRolesDialog', () => ({
  ManageUserRolesDialog: ({ user }: { user: { id: string } }) => (
    <div data-testid="manage-roles-dialog">{user.id}</div>
  ),
}));

import UserManagementPage from '../UserManagementPage';

describe('UserManagementPage ?userId= with an auth user id (MYK9-1533)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRpc.mockResolvedValue({ data: [RPC_ROW], error: null });
  });

  it('opens the roles dialog for the people row that owns the auth id', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'people-1' }, error: null });
    render(<UserManagementPage />, { initialRoute: '/admin/users?userId=auth-abc' });

    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
    expect(mockEq).toHaveBeenCalledWith('people', 'id', 'auth_user_id', 'auth-abc');
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });

  it('opens straight away on a people id without any lookup', async () => {
    render(<UserManagementPage />, { initialRoute: '/admin/users?userId=people-1' });
    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('says user not found when the id matches no one, and keeps the list', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    render(<UserManagementPage />, { initialRoute: '/admin/users?userId=ghost' });

    expect(await screen.findByText(/user not found/i)).toBeInTheDocument();
    expect(screen.getByTestId('user-table')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });

  it('says nothing about a missing user when no userId is given', async () => {
    render(<UserManagementPage />, { initialRoute: '/admin/users' });
    await screen.findByTestId('user-table');
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });
});
