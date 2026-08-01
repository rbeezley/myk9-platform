import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

// ── Mock data ───────────────────────────────────────────────────────────────

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

// ── Mutable mock state ──────────────────────────────────────────────────────

const mockRefetch = vi.fn();
let mockQueryReturn: {
  data: User[];
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
} = {
  data: [makeUser()],
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

// ── Mocks ───────────────────────────────────────────────────────────────────

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
  UserFilters: () => <div data-testid="user-filters">Filters</div>,
}));

// This page suite is about the page (filters, table, selection), so the dialog
// is stubbed. Be aware of what that costs: this mock is why MYK9-131 shipped —
// "Create User" produced an account with no auth identity while this file
// passed 8/8. Creation behaviour is covered against the REAL component in
// components/admin/users/CreateUserDialog.test.tsx. Assert creation there, not
// by un-stubbing here.
vi.mock('@/components/admin/users/CreateUserDialog', () => ({
  CreateUserDialog: () => null,
}));

vi.mock('@/components/admin/users/BulkActionsBar', () => ({
  BulkActionsBar: () => null,
}));

vi.mock('@/components/panels/edit/UserEditPanel', () => ({
  UserEditPanel: () => null,
}));

vi.mock('../UserManagementStats', () => ({
  UserManagementStats: () => <div data-testid="user-stats">Stats</div>,
}));

vi.mock('../UserManagementPage.helpers', () => ({
  filterUsers: (users: User[]) => users,
  sortUsers: (users: User[]) => users,
  calculateRoleStats: () => ({}),
  countActiveUsers: (users: User[]) => users.length,
  exportUsersCSV: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

import UserManagementPage from '../UserManagementPage';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('UserManagementPage (shared primitives migration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryReturn = {
      data: [makeUser()],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    };
  });

  it('renders inside a PageShell wrapper (max-w-7xl container)', () => {
    renderPage();
    const shell = document.querySelector('.max-w-7xl');
    expect(shell).toBeTruthy();
  });

  it('renders breadcrumb with Admin > Users hierarchy via PageHeader', () => {
    renderPage();
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeInTheDocument();
    expect(nav.textContent).toContain('Admin');
    expect(nav.textContent).toContain('Users');
  });

  it('renders ErrorState when query returns error', () => {
    mockQueryReturn = {
      ...mockQueryReturn,
      error: new Error('Failed'),
      data: [],
    };

    renderPage();

    expect(screen.getByText('Failed to load users.')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders UserManagementStats section', () => {
    renderPage();
    expect(screen.getByTestId('user-stats')).toBeInTheDocument();
  });

  // The placeholder may only promise fields `filterUsers` actually searches.
  // `get_admin_user_list` returns no membership ID, so the old "or ID" promise
  // could never match anything.
  it('renders SearchBar promising only the fields that are searched', () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText('Search by name, email, or phone...');
    expect(searchInput).toBeInTheDocument();
  });

  it('renders user table when data is present', () => {
    renderPage();
    expect(screen.getByTestId('user-table')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('does not render inline SF Pro font styles', () => {
    renderPage();
    // No elements should have inline fontFamily style
    const allElements = document.querySelectorAll('[style]');
    allElements.forEach(el => {
      const style = el.getAttribute('style') || '';
      expect(style).not.toContain('SF Pro');
      expect(style).not.toContain('BlinkMacSystemFont');
    });
  });

  it('shows results count in a live region, so filtering announces itself', () => {
    renderPage();
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Showing 1 of 1 user');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders a visible page title, not only a screen-reader one', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'User Management' })).toBeVisible();
  });

  // Regression: the empty state was gated on there being active filters, and
  // the table on there being rows — so a platform with zero users rendered the
  // toolbar and then nothing at all.
  it('shows a first-run empty state when there are no users and no filters', () => {
    mockQueryReturn = { ...mockQueryReturn, data: [] };

    renderPage();

    expect(screen.getByText('No users yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create the first user/i })).toBeInTheDocument();
    expect(screen.queryByTestId('user-table')).not.toBeInTheDocument();
  });

  it('shows a filtered empty state once a search is entered', async () => {
    mockQueryReturn = { ...mockQueryReturn, data: [] };

    renderPage();
    await userEvent.type(screen.getByPlaceholderText(/search by name/i), 'zzz');

    expect(screen.getByText('No users match your filters')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });
});
