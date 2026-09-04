import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  data: User[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
  fetchStatus?: 'fetching' | 'paused' | 'idle';
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
    expect(status.textContent).toContain('1 user in view');
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
  // MYK9-365. This block was unreachable before: the condition was
  // `isLoading && fetchStatus === 'paused'`, and query-core derives
  // `isFetching = fetchStatus === 'fetching'` with `isLoading = isPending &&
  // isFetching`, so those two can never hold together. The calm offline state
  // could not render, and a cold offline boot showed the admin a raw
  // "TypeError: Failed to fetch" instead (measured on /admin/users).
  describe('offline roster', () => {
    const setOnLine = (value: boolean) =>
      Object.defineProperty(window.navigator, 'onLine', {
        get: () => value,
        configurable: true,
      });

    afterEach(() => setOnLine(true));

    it('shows the calm waiting state when the query is paused with no roster', () => {
      mockQueryReturn = { ...mockQueryReturn, data: undefined, fetchStatus: 'paused' };

      renderPage();

      expect(screen.getByText('Waiting for a connection')).toBeInTheDocument();
      expect(screen.queryByText('Failed to load users.')).not.toBeInTheDocument();
    });

    // The case that actually happens on a device with no signal: the request
    // goes out, fails, and lands in `error` — `onlineManager` starts optimistic
    // so nothing ever pauses on a cold boot.
    it('shows the calm waiting state when the read failed and the device is offline', () => {
      setOnLine(false);
      mockQueryReturn = {
        ...mockQueryReturn,
        data: undefined,
        error: new Error('TypeError: Failed to fetch'),
        fetchStatus: 'idle',
      };

      renderPage();

      expect(screen.getByText('Waiting for a connection')).toBeInTheDocument();
      expect(screen.queryByText('Failed to load users.')).not.toBeInTheDocument();
    });

    // Positive control for the two above: an ONLINE failure must still read as a
    // real error, or "calm state shown" would prove nothing about being offline.
    it('still shows the real error when the read failed while online', () => {
      setOnLine(true);
      mockQueryReturn = {
        ...mockQueryReturn,
        data: undefined,
        error: new Error('Boom'),
        fetchStatus: 'idle',
      };

      renderPage();

      expect(screen.getByText('Failed to load users.')).toBeInTheDocument();
      expect(screen.queryByText('Waiting for a connection')).not.toBeInTheDocument();
    });

    // An offline blip must not hide a roster the admin can still read.
    it('keeps the roster on screen when cached users exist', () => {
      setOnLine(false);
      mockQueryReturn = { ...mockQueryReturn, data: [makeUser()], fetchStatus: 'paused' };

      renderPage();

      expect(screen.queryByText('Waiting for a connection')).not.toBeInTheDocument();
      expect(screen.getByTestId('user-table')).toBeInTheDocument();
    });
    // Codex review, P2. A roster that was READ and found empty is a fact the
    // admin can act on — "No users yet" plus a create button. A later offline
    // pause must not overwrite that with "Waiting for a connection", which is
    // what testing `users.length === 0` did: `users` defaults to `[]`, so a
    // cached empty roster and a never-read one looked identical.
    it('keeps the empty-roster state when a successful empty read later pauses', () => {
      setOnLine(false);
      mockQueryReturn = { ...mockQueryReturn, data: [], fetchStatus: 'paused' };

      renderPage();

      expect(screen.getByText('No users yet')).toBeInTheDocument();
      expect(screen.queryByText('Waiting for a connection')).not.toBeInTheDocument();
    });
  });
});
