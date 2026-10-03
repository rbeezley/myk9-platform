import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
vi.mock('@/components/admin/users/CreateUserDialog', () => ({ CreateUserDialog: () => null }));
vi.mock('@/components/admin/users/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/panels/edit/UserEditPanel', () => ({ UserEditPanel: () => null }));
vi.mock('@/components/admin/permissions/ManageUserRolesDialog', () => ({
  ManageUserRolesDialog: () => null,
}));
vi.mock('../UserManagementPage.helpers', () => ({
  filterUsers: (users: User[]) => users,
  sortUsers: (users: User[]) => users,
  calculateRoleStats: () => ({}),
  exportUsersCSV: vi.fn(),
}));

import UserManagementPage from '../UserManagementPage';

function LocationProbe() {
  return <p data-testid="location">{useLocation().pathname}</p>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <UserManagementPage />
          <LocationProbe />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe('UserManagementPage cross-links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links to the role requests queue that feeds it', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('combobox', { name: 'Show: User views' }));
    await user.click(await screen.findByRole('option', { name: /role requests/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/role-requests');
  });

  it('keeps Create User and Export Users available', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /create user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export users/i })).toBeInTheDocument();
  });
});
