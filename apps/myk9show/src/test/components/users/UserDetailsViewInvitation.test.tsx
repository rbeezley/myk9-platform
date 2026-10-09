/**
 * MYK9-134 — the invitation action must be REACHABLE from the page the app
 * actually opens.
 *
 * This issue existed because `UserSecurityActions` (Send password reset /
 * Generate reset link) lives inside `UserDetailsDialog`, which nothing renders —
 * 11 tests passed against a component no user can open. So these tests render
 * the real `UserDetailsView` and assert the action is present and wired,
 * not that a component in isolation behaves. It lives in the header Actions
 * menu (CRUD standard decision 6), so the page's registration is what's read.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import type { User } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { registeredPageActions, resetPageActions, runPageAction } from '@/test/utils/pageActions';

const hasPermission = vi.fn().mockReturnValue(true);
const sendInvitation = vi.fn();

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission }) }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => ['site_admin'],
    hasPermission,
  }),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({ useRoleBasedPeople: () => [] }));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
  useDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
  usePermanentDeleteUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/store/userStore', () => ({ useUserStore: () => ({ loadUsers: vi.fn() }) }));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useOwnerDogsWithQuery: () => ({
    dogs: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    isStale: false,
  }),
  useDogStoreCompat: () => ({
    dogs: [],
    addDog: vi.fn(),
    updateDog: vi.fn(),
    deleteDog: vi.fn(),
    getDogsByOwner: () => [],
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/components/users/UserDetails/UserDetailsTabs', () => ({
  default: () => <div data-testid="user-details-tabs" />,
}));
vi.mock('@/components/users/UserDetails/JudgeAvailabilityCard', () => ({
  default: () => <div data-testid="judge-availability-card" />,
}));
vi.mock('@/components/users/UserDetails/UserDetailsDialogs', () => ({
  default: () => <div data-testid="user-details-dialogs" />,
}));

// The hook is unit-tested separately; here we only care that the page wires it.
vi.mock('@/components/users/UserDetails/useSendUserInvitation', () => ({
  useSendUserInvitation: () => ({ sendInvitation, isSending: false }),
}));

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-123',
    firstName: 'Pat',
    lastName: 'Secretary',
    email: 'pat@example.test',
    roles: [UserRole.SECRETARY],
    dogs: [],
    ...overrides,
  }) as User;

function renderView(user: User) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UserDetailsView person={user} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPermission.mockReturnValue(true);
  resetPageActions();
});

describe('UserDetailsView — invitation action', () => {
  it('offers "Send Invitation" for a person with no auth identity', async () => {
    renderView(makeUser());

    expect(registeredPageActions()).toContain('Send Invitation');
  });

  it('offers "Send Sign-In Link" once the person already has an account', async () => {
    // Wording matters: the operator should not be told a new invitation is
    // being created for someone who already has an identity.
    renderView(makeUser({ user_id: 'auth-uuid' }));

    expect(registeredPageActions()).toContain('Send Sign-In Link');
    expect(registeredPageActions()).not.toContain('Send Invitation');
  });

  it('sends the invitation with the saved email when chosen', async () => {
    renderView(makeUser());

    runPageAction('Send Invitation');

    await waitFor(() =>
      expect(sendInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ personId: 'user-123', email: 'pat@example.test' })
      )
    );
  });

  it('shows "No account" on the RENDERED page for a person who cannot sign in', () => {
    // Asserted against UserDetailsView's own `properties`, not AccountSummaryCard:
    // nothing renders that card, so a test there would pass while the page kept
    // showing a literal "Active" — the very trap MYK9-134 is about.
    renderView(makeUser());

    expect(screen.getByText('No account')).toBeInTheDocument();
  });

  it('shows "Can sign in" on the rendered page once an identity exists', () => {
    renderView(makeUser({ user_id: 'auth-uuid' }));

    expect(screen.getByText('Can sign in')).toBeInTheDocument();
  });

  it('never claims a blanket "Active" status on the rendered page', () => {
    renderView(makeUser());

    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('hides the action from a caller without admin:manage', async () => {
    hasPermission.mockReturnValue(false);
    renderView(makeUser());

    expect(registeredPageActions()).not.toContain('Send Invitation');
    expect(registeredPageActions()).not.toContain('Send Sign-In Link');
    // Positive control: the page did register, just without the gated item.
    expect(registeredPageActions()).toContain('Change Photo');
  });
});
