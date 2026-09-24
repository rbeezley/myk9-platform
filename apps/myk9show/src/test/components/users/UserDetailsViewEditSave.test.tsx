/**
 * The person edit panel must report a refused save as a failure.
 *
 * MYK9-710 option C made the database refuse a non-site-admin email change on
 * anyone with entries. `UserDetailsView.handleUserEditSave` used to catch every
 * error without rethrowing, so `EditPanelWrapper` (which keeps the panel open
 * only when `onSave` throws) closed the panel as if the save had worked, and
 * the rejected values had already been written into the page's local state.
 *
 * Rendered end to end on the real prop shapes: the real UserDetailsView, the
 * real UserDetailsDialogs, UserEditPanel and EditPanelWrapper. Only the data
 * hooks are mocked, and the update mutation is the seam under test.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import type { User } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';

const { mutateAsync, notifySuccess, notifyError, hasPermission } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  hasPermission: vi.fn().mockReturnValue(false),
}));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission }) }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => ['secretary'],
    hasPermission,
  }),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({ useRoleBasedPeople: () => [] }));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: () => ({ mutateAsync }),
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

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: notifySuccess,
    error: notifyError,
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/components/users/UserDetails/UserDetailsTabs', () => ({
  default: () => <div data-testid="user-details-tabs" />,
}));
vi.mock('@/components/users/UserDetails/JudgeAvailabilityCard', () => ({
  default: () => <div data-testid="judge-availability-card" />,
}));

const OLD_PHONE = '555-123-4567';
const NEW_PHONE = '555-999-0000';

const person = {
  id: 'person-123',
  firstName: 'Mail',
  lastName: 'In',
  email: 'mail.in@example.test',
  phone: OLD_PHONE,
  streetAddress: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  zipCode: '62701',
  roles: [UserRole.EXHIBITOR],
  dogs: [],
} as User;

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UserDetailsView person={person} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openEditPanelAndChangePhone() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(await screen.findByRole('menuitem', { name: /edit person/i }));
  const panel = await screen.findByRole('dialog');
  await user.click(within(panel).getByRole('tab', { name: /contact/i }));
  const phone = await within(panel).findByLabelText(/phone number/i);
  await user.clear(phone);
  await user.type(phone, NEW_PHONE);
  await user.click(within(panel).getByRole('button', { name: /save changes/i }));
  return panel;
}

beforeEach(() => {
  vi.clearAllMocks();
  hasPermission.mockReturnValue(false);
});

describe('UserDetailsView edit save', () => {
  it('keeps the panel open, reports the refusal and keeps the stored values when the server rejects the save', async () => {
    mutateAsync.mockRejectedValue(
      Object.assign(
        new Error(
          'This person already has entries, so only a site admin can change their email address.'
        ),
        { code: '42501' }
      )
    );

    renderView();
    expect(screen.getByText(OLD_PHONE)).toBeInTheDocument();

    const panel = await openEditPanelAndChangePhone();

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    // EditPanelWrapper's own failure report: it only fires when onSave throws,
    // and it is the same branch that skips closing the panel.
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        'Failed to save changes',
        expect.objectContaining({ description: expect.stringMatching(/only a site admin/i) })
      )
    );
    expect(notifySuccess).not.toHaveBeenCalled();
    // The panel stayed open with the user's edit still in it (the panel
    // re-renders its tabs from the first one after a save attempt)...
    expect(panel).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('tab', { name: /contact/i }));
    expect(await within(panel).findByLabelText(/phone number/i)).toHaveValue(NEW_PHONE);
    // ...and the page behind it still shows what is actually stored.
    expect(screen.getByText(OLD_PHONE)).toBeInTheDocument();
    expect(screen.queryByText(NEW_PHONE)).not.toBeInTheDocument();
    // Still open once any close animation would have finished (the success
    // case below shows a closing panel unmounts).
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes the panel and shows the saved values when the save succeeds', async () => {
    mutateAsync.mockResolvedValue({ ...person, phone: NEW_PHONE });

    renderView();
    await openEditPanelAndChangePhone();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'person-123',
        updates: expect.objectContaining({ phone: NEW_PHONE }),
      })
    );
    expect(notifySuccess).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    expect(screen.getByText(NEW_PHONE)).toBeInTheDocument();
  });
});
