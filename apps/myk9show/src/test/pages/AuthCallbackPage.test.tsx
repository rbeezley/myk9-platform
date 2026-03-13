import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

const mockVerifyOtp = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
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
  });

  it('shows loading state during verification', () => {
    mockVerifyOtp.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter('?token_hash=abc&type=signup');
    expect(screen.getByText(/verifying/i)).toBeInTheDocument();
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

  it('shows error when params are missing', async () => {
    renderWithRouter('');
    await waitFor(() => expect(screen.getByText(/invalid/i)).toBeInTheDocument());
  });
});
