import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

const makeUser = (): User =>
  ({
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    roles: ['exhibitor'],
    status: 'active',
  }) as User;

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useAdminUsersQuery: () => ({
    data: [makeUser()],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: () => <div data-testid="user-table" />,
}));
vi.mock('@/components/admin/users/UserFilters', () => ({ UserFilters: () => null }));
vi.mock('@/components/admin/users/CreateUserDialog', () => ({ CreateUserDialog: () => null }));
vi.mock('@/components/admin/users/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/panels/edit/UserEditPanel', () => ({ UserEditPanel: () => null }));
vi.mock('../UserManagementStats', () => ({ UserManagementStats: () => null }));
vi.mock('@/components/admin/permissions/ManageUserRolesDialog', () => ({
  ManageUserRolesDialog: () => null,
}));
vi.mock('../UserManagementPage.helpers', () => ({
  filterUsers: (users: User[]) => users,
  sortUsers: (users: User[]) => users,
  calculateRoleStats: () => ({}),
  countActiveUsers: (users: User[]) => users.length,
  exportUsersCSV: vi.fn(),
}));

import UserManagementPage from '../UserManagementPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserManagementPage cross-links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links to the role requests queue that feeds it', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /role requests/i });
    expect(link).toHaveAttribute('href', '/admin/role-requests');
  });

  it('keeps Create User and Export Users available', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /create user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export users/i })).toBeInTheDocument();
  });
});
