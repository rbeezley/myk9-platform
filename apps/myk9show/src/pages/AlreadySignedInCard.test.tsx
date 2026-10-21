import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { AlreadySignedInCard } from './AlreadySignedInCard';

const signOutMock = vi.fn();
let mockRoles: UserRole[] = [];
let mockOnline = true;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'u1', email: 'sec@example.com' },
    userWithRoles: { roles: mockRoles },
    getUserRoles: () => mockRoles,
    signOut: signOutMock,
  }),
}));
vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced', queueSize: 0, isOnline: true }),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: mockOnline }),
}));

describe('AlreadySignedInCard', () => {
  beforeEach(() => {
    signOutMock.mockReset();
    mockRoles = [UserRole.EXHIBITOR];
    mockOnline = true;
  });

  it('links to the role dashboard', () => {
    mockRoles = [UserRole.SECRETARY];
    render(<AlreadySignedInCard />);

    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute(
      'href',
      '/secretary/dashboard'
    );
  });

  it('signs out directly for an online exhibitor', async () => {
    const user = userEvent.setup();
    render(<AlreadySignedInCard />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('puts staff behind the MYK9-202 guard before signing out', async () => {
    mockRoles = [UserRole.SECRETARY];
    const user = userEvent.setup();
    render(<AlreadySignedInCard />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOutMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Sign out before a show?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign out anyway' }));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('warns offline even for an exhibitor', async () => {
    mockOnline = false;
    const user = userEvent.setup();
    render(<AlreadySignedInCard />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
