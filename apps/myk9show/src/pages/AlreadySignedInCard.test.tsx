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
  it('cancelling the guard keeps the session and closes the dialog', async () => {
    mockRoles = [UserRole.SECRETARY];
    const user = userEvent.setup();
    render(<AlreadySignedInCard />);

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('Sign out before a show?');
    await user.click(screen.getByRole('button', { name: 'Stay signed in' }));

    expect(signOutMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Sign out before a show?')).not.toBeInTheDocument();
  });

  it('continues to a valid returnTo instead of the dashboard', () => {
    render(<AlreadySignedInCard />, { initialRoute: '/sign-in?returnTo=/shows/x/register' });

    expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute(
      'href',
      '/shows/x/register'
    );
    expect(screen.queryByRole('link', { name: 'Go to your dashboard' })).not.toBeInTheDocument();
  });

  it('ignores an unsafe redirectTo', () => {
    render(<AlreadySignedInCard />, { initialRoute: '/sign-in?redirectTo=https://evil.example' });

    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toBeInTheDocument();
  });

  it('offers the passcode path to ringside entry', () => {
    render(<AlreadySignedInCard />);

    expect(screen.getByRole('link', { name: 'Join a show with a passcode' })).toHaveAttribute(
      'href',
      '/at-show?passcode=1'
    );
  });
});
