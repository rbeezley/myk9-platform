/**
 * MYK9-1090 (plan-offline-record-edits §5): saving an edit to an existing
 * person while offline is refused at once, and the edit panel says so.
 *
 * Rendered with the real UserDetailsView, edit panel, EditPanelWrapper and the
 * REAL useUpdateUserMutation -> UserService.update -> updateUser chain, so the
 * test covers the connectivity check, the mutation's network mode and the
 * friendly-error copy together. Only the page's other data hooks are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@/test/utils/testUtils';

import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import type { User } from '@/types/dog-types';
import { UserRole } from '@/types/auth-types';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';
import { mockSupabase } from '@/test/mocks/supabase';

const { notifySuccess, notifyError, hasPermission } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  hasPermission: vi.fn().mockReturnValue(false),
}));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission }) }));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'current-user-id' },
    getUserRoles: () => ['secretary'],
    hasRole: () => false,
    hasPermission,
  }),
}));

vi.mock('@/hooks/useRoleBasedData', () => ({ useRoleBasedPeople: () => [] }));

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

beforeEach(() => {
  vi.clearAllMocks();
  hasPermission.mockReturnValue(false);
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  onlineManager.setOnline(false);
});

afterEach(() => {
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
});

describe('UserDetailsView edit save while offline (MYK9-1090)', () => {
  it('says to reconnect, keeps the panel open with the edit, and sends nothing', async () => {
    const { user } = render(<UserDetailsView person={person} />);

    // Edit person is the header Actions menu's item (MYK9-928); run what it runs.
    act(() => usePageEditTargetStore.getState().target?.run());
    const panel = await screen.findByRole('dialog');
    await user.click(within(panel).getByRole('tab', { name: /contact/i }));
    const phone = await within(panel).findByLabelText(/phone number/i);
    await user.clear(phone);
    await user.type(phone, NEW_PHONE);
    await user.click(within(panel).getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith(
        "Couldn't save your changes",
        expect.objectContaining({
          description: expect.stringMatching(/^Reconnect to save changes/),
        })
      )
    );
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(panel).toBeInTheDocument();
    await user.click(within(panel).getByRole('tab', { name: /contact/i }));
    expect(await within(panel).findByLabelText(/phone number/i)).toHaveValue(NEW_PHONE);
    expect(screen.getByText(OLD_PHONE)).toBeInTheDocument();
  });
});
