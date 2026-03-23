import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  calculateRoleStats: () => ({}),
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

  it('renders SearchBar with correct placeholder', () => {
    renderPage();
    const searchInput = screen.getByPlaceholderText('Search by name, email, or ID...');
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

  it('shows results count', () => {
    renderPage();
    expect(screen.getByText(/1 of 1 user/)).toBeInTheDocument();
  });
});
