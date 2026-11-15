import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import SignUpPage from '@/pages/SignUpPage';

vi.mock('@/components/security/TurnstileChallenge', () => ({
  TurnstileChallenge: forwardRef(function MockTurnstileChallenge(
    props: { onTokenChange: (token: string | null) => void },
    ref
  ) {
    useImperativeHandle(ref, () => ({ reset: () => props.onTokenChange(null) }));
    return (
      <button type="button" onClick={() => props.onTokenChange('turnstile-token')}>
        Complete security check
      </button>
    );
  }),
}));

const mockResendConfirmationEmail = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signUp: vi.fn(),
    resendConfirmationEmail: mockResendConfirmationEmail,
    signInWithGoogle: vi.fn(),
    signInWithApple: vi.fn(),
    loading: false,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: { success: vi.fn(), error: vi.fn() },
}));

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SignUpPage />
    </MemoryRouter>
  );
}

describe('SignUpPage resend-only mode (?resend=1, MYK9-2029)', () => {
  beforeEach(() => {
    mockResendConfirmationEmail.mockReset();
    mockResendConfirmationEmail.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sends a new link to the typed email and shows no registration form', async () => {
    const user = userEvent.setup();
    renderAt('/sign-up?resend=1');

    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/enter the email you signed up with/i)).toBeInTheDocument();

    const send = screen.getByRole('button', { name: 'Send a new link' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('Email'), 'pat@example.com');
    await user.click(send);

    expect(mockResendConfirmationEmail).toHaveBeenCalledWith('pat@example.com');
    expect(
      await screen.findByRole('button', { name: /resend email in \d+s|send a new link/i })
    ).toBeDisabled();
  });

  it('carries the return target into the resend', async () => {
    const user = userEvent.setup();
    renderAt('/sign-up?returnTo=%2Fshows%2F1&resend=1');

    await user.type(screen.getByLabelText('Email'), 'pat@example.com');
    await user.click(screen.getByRole('button', { name: 'Send a new link' }));

    expect(mockResendConfirmationEmail).toHaveBeenCalledWith(
      'pat@example.com',
      undefined,
      '/shows/1'
    );
  });

  it('holds the button until the security check is complete when Turnstile is configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    const user = userEvent.setup();
    renderAt('/sign-up?resend=1');

    await user.type(screen.getByLabelText('Email'), 'pat@example.com');
    const send = screen.getByRole('button', { name: 'Send a new link' });
    expect(send).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Complete security check' }));
    await user.click(send);

    expect(mockResendConfirmationEmail).toHaveBeenCalledWith('pat@example.com', 'turnstile-token');
  });
});
