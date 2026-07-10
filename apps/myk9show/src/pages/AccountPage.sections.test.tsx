import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { DeleteSection } from './AccountPage.sections';
import { deleteUser } from '@/services/database/users';
import { toast } from 'sonner';

const mockSignOut = vi.fn();

vi.mock('@/services/database/users', () => ({
  deleteUser: vi.fn(),
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'auth-user-1' },
    signOut: mockSignOut,
  }),
}));

vi.mock('@/hooks/useProfileForm', async importOriginal => {
  const actual = await importOriginal<typeof import('@/hooks/useProfileForm')>();
  return {
    ...actual,
    useCurrentUserPerson: () => ({ data: { id: 'person-1' }, isLoading: false }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedDeleteUser = vi.mocked(deleteUser);

async function clickThroughConfirm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /delete my account/i }));
  await user.click(screen.getByRole('button', { name: /yes, delete account/i }));
  return user;
}

describe('DeleteSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteUser with the current person id on confirm', async () => {
    mockedDeleteUser.mockResolvedValue({ data: { id: 'person-1' }, error: null } as never);
    render(<DeleteSection />);
    await clickThroughConfirm();

    await waitFor(() => {
      expect(mockedDeleteUser).toHaveBeenCalledWith('person-1');
    });
  });

  it('signs out after a successful delete', async () => {
    mockedDeleteUser.mockResolvedValue({ data: { id: 'person-1' }, error: null } as never);
    render(<DeleteSection />);
    await clickThroughConfirm();

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  it('surfaces the MK001 owns-dogs error and does not sign out', async () => {
    mockedDeleteUser.mockResolvedValue({
      data: null,
      error: {
        name: 'DatabaseError',
        message: 'This person still owns 6 live dog(s). Delete those dogs first.',
        code: 'MK001',
      },
    } as never);
    render(<DeleteSection />);
    await clickThroughConfirm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('tells the user the delete succeeded when only sign-out fails', async () => {
    mockedDeleteUser.mockResolvedValue({ data: { id: 'person-1' }, error: null } as never);
    mockSignOut.mockRejectedValue(new Error('network down'));
    render(<DeleteSection />);
    await clickThroughConfirm();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('signing out failed'));
    });
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not call deleteUser before the confirmation step', async () => {
    render(<DeleteSection />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /delete my account/i }));
    expect(mockedDeleteUser).not.toHaveBeenCalled();
  });
});
