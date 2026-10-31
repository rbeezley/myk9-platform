import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { createTestQueryClient, render } from '@/test/utils/testUtils';
import { queryKeys } from '@/lib/queryClient';
import { mapDbUserToUser } from '@/hooks/queries/useUsersQuery';
import type { DbUser } from '@/types/database-mappings';

// The real get_admin_user_list row shape: no auth_user_id column.
const AUTH_ID = '11111111-2222-3333-4444-555555555555';

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
    render(<UserManagementPage />, { initialRoute: `/admin/users?userId=${AUTH_ID}` });

    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
    expect(mockEq).toHaveBeenCalledWith('people', 'id', 'auth_user_id', AUTH_ID);
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });

  it('opens straight away on a people id without any lookup', async () => {
    render(<UserManagementPage />, { initialRoute: '/admin/users?userId=people-1' });
    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('says user not found when the id matches no one, and keeps the list', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    render(<UserManagementPage />, {
      initialRoute: '/admin/users?userId=99999999-2222-3333-4444-555555555555',
    });

    expect(await screen.findByText(/user not found/i)).toBeInTheDocument();
    expect(screen.getByTestId('user-table')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });

  it('reports a failed lookup as an error with Retry, not as a missing user', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('network down') });
    const { user } = render(<UserManagementPage />, {
      initialRoute: `/admin/users?userId=${AUTH_ID}`,
    });

    expect(await screen.findByText(/could not look up that user/i)).toBeInTheDocument();
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();

    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'people-1' }, error: null });
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
  });

  it('says user not found for a non-UUID id without querying (MYK9-1567)', async () => {
    render(<UserManagementPage />, { initialRoute: '/admin/users?userId=ghost' });

    expect(await screen.findByText(/user not found/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not look up/i)).not.toBeInTheDocument();
    expect(mockEq).not.toHaveBeenCalled();
  });

  it('shows a needs-connection state while offline and looks up on reconnect (MYK9-1567)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'people-1' }, error: null });
    // Offline with a cached roster: seed it so only the auth-id lookup is paused.
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(
      [...queryKeys.users.all, 'admin', { showDeleted: false }],
      [{ ...mapDbUserToUser(RPC_ROW as unknown as DbUser), lastSignInAt: null }]
    );
    onlineManager.setOnline(false);
    try {
      render(<UserManagementPage />, {
        initialRoute: `/admin/users?userId=${AUTH_ID}`,
        queryClient,
      });

      expect(await screen.findByText(/needs a connection/i)).toBeInTheDocument();
      expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
      expect(mockEq).not.toHaveBeenCalled();

      act(() => onlineManager.setOnline(true));
      expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
      expect(mockEq).toHaveBeenCalledWith('people', 'id', 'auth_user_id', AUTH_ID);
      expect(screen.queryByText(/needs a connection/i)).not.toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('treats a lookup that fails after the device went offline as needs-connection (MYK9-1567)', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    try {
      render(<UserManagementPage />, { initialRoute: `/admin/users?userId=${AUTH_ID}` });

      expect(await screen.findByText(/needs a connection/i)).toBeInTheDocument();
      expect(screen.queryByText(/could not look up that user/i)).not.toBeInTheDocument();
    } finally {
      onLine.mockRestore();
    }
  });

  it('refetches and opens the user when the online event follows an offline-start failure (MYK9-1567)', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    try {
      render(<UserManagementPage />, { initialRoute: `/admin/users?userId=${AUTH_ID}` });
      expect(await screen.findByText(/needs a connection/i)).toBeInTheDocument();
      expect(mockMaybeSingle).toHaveBeenCalledTimes(1);

      mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'people-1' }, error: null });
      onLine.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
      expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
    } finally {
      onLine.mockRestore();
    }
  });

  it('the needs-connection alert has a Retry that refetches (MYK9-1567)', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('Failed to fetch') });
    try {
      const { user } = render(<UserManagementPage />, {
        initialRoute: `/admin/users?userId=${AUTH_ID}`,
      });
      expect(await screen.findByText(/needs a connection/i)).toBeInTheDocument();

      mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'people-1' }, error: null });
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('people-1');
      expect(mockMaybeSingle).toHaveBeenCalledTimes(2);
    } finally {
      onLine.mockRestore();
    }
  });

  it('says nothing about a missing user when no userId is given', async () => {
    render(<UserManagementPage />, { initialRoute: '/admin/users' });
    await screen.findByTestId('user-table');
    await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
  });
});
