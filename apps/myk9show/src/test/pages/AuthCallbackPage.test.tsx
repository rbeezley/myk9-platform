import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

const mockVerifyOtp = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithRouter(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <AuthCallbackPage />
    </MemoryRouter>
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  describe('OTP verification flow', () => {
    it('shows loading state during verification', () => {
      mockVerifyOtp.mockReturnValue(new Promise(() => {}));
      renderWithRouter('?token_hash=abc&type=signup');
      expect(screen.getByRole('status', { name: /verifying your email/i })).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeNull();
    });

    it('redirects to home on successful signup verification', async () => {
      mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
      renderWithRouter('?token_hash=abc&type=signup');
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    });

    it('redirects to reset-password on successful recovery verification', async () => {
      mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
      renderWithRouter('?token_hash=abc&type=recovery');
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/reset-password', { replace: true })
      );
    });

    it('shows error state when verification fails', async () => {
      mockVerifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token expired' } });
      renderWithRouter('?token_hash=abc&type=signup');
      await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
    });
  });

  describe('OAuth callback flow', () => {
    it('shows loading state for OAuth callback (no query params)', () => {
      renderWithRouter('');
      expect(screen.getByRole('status', { name: /verifying your email/i })).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeNull();
    });

    it('redirects to home when session is already available', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: '123' } } },
        error: null,
      });
      renderWithRouter('');
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    });

    it('redirects to redirectTo when session is already available', async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: '123' } } },
        error: null,
      });
      renderWithRouter('?redirectTo=%2Fshows%2Fshow-1%2Fregister');
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/shows/show-1/register', { replace: true })
      );
    });

    it('uses persisted redirect when OAuth callback has no query params', async () => {
      window.sessionStorage.setItem('myk9.signIn.redirectTo', '/shows/show-1/register');
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: '123' } } },
        error: null,
      });
      renderWithRouter('');
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/shows/show-1/register', { replace: true })
      );
      expect(window.sessionStorage.getItem('myk9.signIn.redirectTo')).toBeNull();
    });

    it('redirects to home when auth state changes to SIGNED_IN', async () => {
      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
        setTimeout(() => cb('SIGNED_IN', { user: { id: '123' } }), 50);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });
      renderWithRouter('');
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    });

    it('redirects auth state changes to redirectTo when provided', async () => {
      mockOnAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
        setTimeout(() => cb('SIGNED_IN', { user: { id: '123' } }), 50);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });
      renderWithRouter('?redirectTo=%2Fshows%2Fshow-1%2Fregister');
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/shows/show-1/register', { replace: true })
      );
    });

    it('shows timeout error when no auth event arrives within 10 seconds', async () => {
      vi.useFakeTimers();
      renderWithRouter('');

      expect(screen.getByRole('status', { name: /verifying your email/i })).toBeInTheDocument();
      expect(document.querySelector('.animate-spin')).toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(10000);
      });

      expect(screen.getByText(/timed out/i)).toBeInTheDocument();
      vi.useRealTimers();
    });
  });
});
