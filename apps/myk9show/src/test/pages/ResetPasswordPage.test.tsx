import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import { testJwt } from '@/features/step-up/stepUpTestTokens';
import { resetStepUpStore } from '@/features/step-up/stepUpStore';

const mockUpdateUser = vi.fn();
const mockGetSession = vi.fn();
const mockNavigate = vi.fn();

const mockReauthenticate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
}));

// The change itself goes through the step-up module's client (MYK9-1208).
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
      reauthenticate: () => mockReauthenticate(),
    },
  },
}));

// A session minted by the recovery link moments ago.
const recoverySession = {
  data: { session: { access_token: testJwt('u1', 30, 'link', 'recovery'), user: { id: 'u1' } } },
};

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStepUpStore();
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
    mockGetSession.mockResolvedValue(recoverySession);
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText(/new password/i)).toBeInTheDocument());
  });

  it('validates passwords match', async () => {
    mockGetSession.mockResolvedValue(recoverySession);
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

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('aria-invalid', 'true');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('puts a callout under the new password when it is too short, focused', async () => {
    mockGetSession.mockResolvedValue(recoverySession);
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await waitFor(() => screen.getByLabelText(/new password/i));
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const field = screen.getByLabelText(/new password/i);
    expect(screen.getByText('Enter a password of at least 8 characters.')).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAttribute('aria-describedby', 'new-password-error');
    expect(field).toHaveFocus();
    expect(screen.queryByText(/must be at least 8 characters\./i)).not.toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();

    await user.type(field, 'password123');
    expect(
      screen.queryByText('Enter a password of at least 8 characters.')
    ).not.toBeInTheDocument();
  });

  it('calls updateUser and shows success on valid submit', async () => {
    mockGetSession.mockResolvedValue(recoverySession);
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

  async function submitNewPassword() {
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
    return user;
  }

  it('an old signed-in session must confirm first: nothing changes without it', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: testJwt('u1', 7_200, 'old'), user: { id: 'u1' } } },
    });
    await submitNewPassword();

    expect(await screen.findByText(/your password was not changed/i)).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('when GoTrue asks for the emailed code, shows a code field and sends it as the nonce', async () => {
    mockGetSession.mockResolvedValue(recoverySession);
    mockUpdateUser
      .mockResolvedValueOnce({ error: { code: 'reauthentication_needed', message: 'x' } })
      .mockResolvedValueOnce({ error: null });
    mockReauthenticate.mockResolvedValue({ error: null });
    const user = await submitNewPassword();

    expect(await screen.findByText(/we've emailed you a code/i)).toBeInTheDocument();
    expect(mockReauthenticate).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText('Code from the email'), '654321');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenLastCalledWith({
        password: 'newpassword123',
        nonce: '654321',
      })
    );
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });
});
