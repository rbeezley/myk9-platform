/**
 * MYK9 Codex P2 (UserListToolbar.tsx:63-65): the clock behind the roster's
 * time-based view counts (30-day, 90-day, "New, last 7 days") was fixed at
 * mount, while the page's own `filterUsers` call for the actually-shown rows
 * defaulted to a fresh `Date.now()` on every roster/filter change. Left open
 * across a day boundary, a view's advertised count and the rows it actually
 * shows can disagree.
 *
 * This drifts most visibly on a login-recency view ("Signed in, last 30
 * days"): its filter stays symbolic ('recent30') rather than resolving to a
 * concrete date, so every re-evaluation re-applies whichever clock it is
 * handed. "New, last 7 days" resolves to a fixed date at selection time, so it
 * cannot exhibit the same badge-vs-rows split; the recency view is the
 * reachable repro for the same root cause the fix addresses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';

const DAY_MS = 86_400_000;

const makeUser = (overrides: Partial<AdminUser> & { id: string }): AdminUser =>
  ({
    firstName: 'Test',
    lastName: overrides.id,
    email: `${overrides.id}@example.com`,
    roles: ['exhibitor'],
    status: 'active',
    lastSignInAt: null,
    ...overrides,
  }) as AdminUser;

const mockRefetch = vi.fn();
let mockQueryReturn: {
  data: User[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
  fetchStatus?: 'fetching' | 'paused' | 'idle';
} = {
  data: [],
  isLoading: false,
  error: null,
  refetch: mockRefetch,
};

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useAdminUsersQuery: () => mockQueryReturn,
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: ({ users }: { users: User[] }) => (
    <div data-testid="user-table">
      {users.map(u => (
        <div key={u.id} data-testid="user-row">
          {u.email}
        </div>
      ))}
    </div>
  ),
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

import UserManagementPage from '../UserManagementPage';

function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage() {
  return render(
    <Providers>
      <UserManagementPage />
    </Providers>
  );
}

describe('UserManagementPage — one shared clock for view counts and filtering', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the "Signed in, last 30 days" count in agreement with the rows it shows across a day boundary and a roster update', () => {
    const t0 = new Date('2026-02-01T10:00:00.000Z').getTime();
    vi.setSystemTime(t0);

    // Signed in 29 days ago at mount — inside the 30-day window at t0.
    const userA = makeUser({
      id: 'user-a',
      lastSignInAt: new Date(t0 - 29 * DAY_MS).toISOString(),
    });
    mockQueryReturn = { data: [userA], isLoading: false, error: null, refetch: mockRefetch };

    const { rerender } = renderPage();

    const views = screen.getByRole('navigation', { name: 'User views' });
    fireEvent.click(within(views).getByRole('button', { name: /Signed in, last 30 days/ }));

    // Advance two days — userA is now 31 days out from "now" and should age
    // out of the 30-day window.
    act(() => {
      vi.setSystemTime(t0 + 2 * DAY_MS);
    });

    // Roster update: a second user, signed in 5 days before the CURRENT time.
    const userB = makeUser({
      id: 'user-b',
      lastSignInAt: new Date(t0 + 2 * DAY_MS - 5 * DAY_MS).toISOString(),
    });
    mockQueryReturn = {
      data: [userA, userB],
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    };
    act(() => {
      rerender(
        <Providers>
          <UserManagementPage />
        </Providers>
      );
    });

    const badgeButton = within(views).getByRole('button', { name: /Signed in, last 30 days/ });
    const badgeCount = Number(badgeButton.textContent?.match(/(\d+)\s*$/)?.[1]);

    const status = screen.getByRole('status');
    const shownCount = Number(status.textContent?.match(/^(\d+)/)?.[1]);

    // Only userB should still be inside the 30-day window relative to the
    // current time — both the tab's own count and the rows actually shown
    // must agree on that.
    expect(badgeCount).toBe(1);
    expect(shownCount).toBe(1);
    expect(badgeCount).toBe(shownCount);
  });
});
