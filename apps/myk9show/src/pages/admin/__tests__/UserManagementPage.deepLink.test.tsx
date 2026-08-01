import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    roles: ['exhibitor'],
    status: 'active',
    ...overrides,
  }) as User;

const mockRefetch = vi.fn();
let mockQueryReturn: {
  data: User[];
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
} = { data: [makeUser()], isLoading: false, error: null, refetch: mockRefetch };

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useAdminUsersQuery: () => mockQueryReturn,
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: ({ users }: { users: User[] }) => (
    <div data-testid="user-table">
      {users.map(u => (
        <div key={u.id}>{u.email}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/admin/users/UserFilters', () => ({
  UserFilters: () => null,
}));
vi.mock('@/components/admin/users/CreateUserDialog', () => ({ CreateUserDialog: () => null }));
vi.mock('@/components/admin/users/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/panels/edit/UserEditPanel', () => ({ UserEditPanel: () => null }));
vi.mock('../UserManagementStats', () => ({ UserManagementStats: () => null }));

// Stubbed so this suite asserts *which user the dialog opened for*, not the
// dialog's own behaviour — that is covered in ManageUserRolesDialog's own tests.
vi.mock('@/components/admin/permissions/ManageUserRolesDialog', () => ({
  ManageUserRolesDialog: ({
    user,
    onOpenChange,
  }: {
    user: User;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="manage-roles-dialog">
      {user.id}
      <button onClick={() => onOpenChange(false)}>close roles dialog</button>
    </div>
  ),
}));

vi.mock('../UserManagementPage.helpers', () => ({
  filterUsers: (users: User[]) => users,
  sortUsers: (users: User[]) => users,
  calculateRoleStats: () => ({}),
  countActiveUsers: (users: User[]) => users.length,
  exportUsersCSV: vi.fn(),
}));

import UserManagementPage from '../UserManagementPage';

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <UserManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserManagementPage ?userId= deep link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryReturn = { data: [makeUser()], isLoading: false, error: null, refetch: mockRefetch };
  });

  it('opens the roles dialog for the named user', async () => {
    renderAt('/admin/users?userId=user-1');
    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('user-1');
  });

  it('does nothing when no userId is given', async () => {
    renderAt('/admin/users');
    await screen.findByTestId('user-table');
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });

  it('is a quiet no-op for an unknown userId — roster still renders', async () => {
    renderAt('/admin/users?userId=nobody-here');
    expect(await screen.findByTestId('user-table')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });

  it('does not reopen the dialog after the admin closes it, even after a refetch', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const typist = userEvent.setup();
    renderAt('/admin/users?userId=user-1');
    await typist.click(await screen.findByRole('button', { name: /close roles dialog/i }));
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();

    // Give the page a brand-new `users` array identity that still contains the
    // same matching user — the shape a refetch produces — then force a
    // re-render by typing in the search box. Closing the dialog already
    // stripped ?userId= from the URL, so there is nothing left for a re-render
    // to resurrect the dialog from, regardless of what `users` looks like.
    mockQueryReturn = { ...mockQueryReturn, data: [makeUser()] };
    await typist.type(screen.getByPlaceholderText(/search by name/i), 'jane');
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });
});
