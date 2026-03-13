import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from '@/pages/ResetPasswordPage';

const mockUpdateUser = vi.fn();
const mockGetSession = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows expired message when no active session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/link expired/i)).toBeInTheDocument());
  });

  it('shows password form when session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText(/new password/i)).toBeInTheDocument());
  });

  it('validates passwords match', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await waitFor(() => screen.getByLabelText(/new password/i));
    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('calls updateUser and shows success on valid submit', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockUpdateUser.mockResolvedValue({ error: null });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await waitFor(() => screen.getByLabelText(/new password/i));
    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
    );
    expect(screen.getByText(/password updated/i)).toBeInTheDocument();
  });
});
