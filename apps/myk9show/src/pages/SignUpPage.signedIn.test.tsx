import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import SignUp from './SignUpPage';

let mockUser: { id: string; email?: string; is_anonymous?: boolean } | null = null;
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: mockUser,
    userWithRoles: null,
    getUserRoles: () => [],
    signOut: vi.fn(),
    signUp: vi.fn(),
    resendConfirmationEmail: vi.fn(),
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    loading: false,
  }),
  getPrimaryRole: vi.fn(),
}));
vi.mock('@/hooks/useGlobalSyncStatus', () => ({
  useGlobalSyncStatus: () => ({ status: 'synced', queueSize: 0, isOnline: true }),
}));
vi.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}));

describe('SignUpPage when already signed in (MYK9-1280)', () => {
  beforeEach(() => {
    mockUser = null;
  });

  it('shows the signed-in card and no credential form for an account session', () => {
    mockUser = { id: 'user-1', email: 'jane@example.com' };
    render(<SignUp />, { initialRoute: '/sign-up' });

    expect(screen.getByRole('heading', { name: 'You are signed in' })).toBeInTheDocument();
    expect(document.querySelector('input[type="email"], input[type="password"]')).toBeNull();
  });

  it('shows the sign-up form when signed out', () => {
    render(<SignUp />, { initialRoute: '/sign-up' });

    expect(screen.queryByText('You are signed in')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    // MYK9-1278: exhibitor access needs no approval, so nothing here says "request".
    expect(screen.queryByText(/request access/i)).not.toBeInTheDocument();
    expect(screen.getByText('I am…')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Exhibitor (I show dogs)' })).toBeInTheDocument();
  });
});
