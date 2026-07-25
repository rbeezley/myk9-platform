import { forwardRef, useImperativeHandle } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

const mockSignUp = vi.fn();
const mockSignInWithGoogle = vi.fn();
const mockResendConfirmationEmail = vi.fn();

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    signUp: mockSignUp,
    resendConfirmationEmail: mockResendConfirmationEmail,
    signInWithGoogle: mockSignInWithGoogle,
    loading: false,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SignUpPage', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockSignInWithGoogle.mockReset();
    mockResendConfirmationEmail.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders a Continue with Google button', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });

  it('passes the return target to Google OAuth', () => {
    render(
      <MemoryRouter initialEntries={['/sign-up?returnTo=%2F%3Fonboarding=true%23get-started']}>
        <SignUpPage />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByLabelText(/I agree to the/i));
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));

    expect(mockSignInWithGoogle).toHaveBeenCalledWith('/?onboarding=true#get-started');
  });

  it('renders an "or" divider between Google button and email form', () => {
    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );
    expect(screen.getByText('or')).toBeInTheDocument();
  });

  describe('TOS Agreement Checkbox', () => {
    it('renders a TOS agreement checkbox', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByLabelText(/I agree to the/i)).toBeInTheDocument();
      expect(screen.getByText(/I agree to the/)).toBeInTheDocument();
    });

    it('renders links to Terms of Service and Privacy Policy', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      const tosLink = screen.getByRole('link', { name: /terms of service/i });
      const privacyLink = screen.getByRole('link', { name: /privacy policy/i });
      expect(tosLink).toHaveAttribute('href', '/terms');
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('disables Sign up button when checkbox is unchecked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /sign up/i })).toBeDisabled();
    });

    it('disables Continue with Google button when checkbox is unchecked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled();
    });

    it('enables Sign up button when checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByLabelText(/I agree to the/i));
      expect(screen.getByRole('button', { name: /sign up/i })).not.toBeDisabled();
    });

    it('enables Continue with Google button when checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByLabelText(/I agree to the/i));
      expect(screen.getByRole('button', { name: /continue with google/i })).not.toBeDisabled();
    });

    it('calls signInWithGoogle when Google button is clicked after checkbox is checked', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      fireEvent.click(screen.getByLabelText(/I agree to the/i));
      fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
      expect(mockSignInWithGoogle).toHaveBeenCalled();
    });

    it('does not call signInWithGoogle when Google button is clicked without checkbox', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );
      const googleBtn = screen.getByRole('button', { name: /continue with google/i });
      fireEvent.click(googleBtn);
      expect(mockSignInWithGoogle).not.toHaveBeenCalled();
    });
  });

  describe('elevated role requests', () => {
    it('explains that club officer and secretary access requires approval', () => {
      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );

      expect(screen.getByText(/request access as/i)).toBeInTheDocument();
      expect(
        screen.getByText(/club officer and secretary access requires approval/i)
      ).toBeInTheDocument();
    });

    it('passes selected elevated roles as signup intent without granting access client-side', async () => {
      const user = userEvent.setup();
      mockSignUp.mockResolvedValue(undefined);

      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/first name/i), 'Pat');
      await user.type(screen.getByLabelText(/last name/i), 'Morgan');
      await user.type(screen.getByLabelText(/email address/i), 'pat@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');
      await user.click(screen.getByLabelText(/club officer/i));
      await user.click(screen.getByLabelText(/show secretary/i));
      await user.click(screen.getByLabelText(/i agree to the/i));
      await user.click(screen.getByRole('button', { name: /sign up/i }));

      expect(mockSignUp).toHaveBeenCalledWith('pat@example.com', 'password123', {
        firstName: 'Pat',
        lastName: 'Morgan',
        roles: ['exhibitor', 'club_officer', 'secretary'],
      });
    });
  });

  it('passes the return target to email signup and resend', async () => {
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue(undefined);
    mockResendConfirmationEmail.mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/sign-up?returnTo=%2F%3Fonboarding=true%23get-started']}>
        <SignUpPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/first name/i), 'Pat');
    await user.type(screen.getByLabelText(/last name/i), 'Morgan');
    await user.type(screen.getByLabelText(/email address/i), 'pat@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByLabelText(/i agree to the/i));
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(mockSignUp).toHaveBeenCalledWith(
      'pat@example.com',
      'password123',
      { firstName: 'Pat', lastName: 'Morgan', roles: ['exhibitor'] },
      undefined,
      '/?onboarding=true#get-started'
    );

    await user.click(screen.getByRole('button', { name: /resend email/i }));
    expect(mockResendConfirmationEmail).toHaveBeenCalledWith(
      'pat@example.com',
      undefined,
      '/?onboarding=true#get-started'
    );
  });

  it('requires and forwards Turnstile verification for email signup when configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    const user = userEvent.setup();
    mockSignUp.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/first name/i), 'Pat');
    await user.type(screen.getByLabelText(/last name/i), 'Morgan');
    await user.type(screen.getByLabelText(/email address/i), 'pat@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByLabelText(/i agree to the/i));
    expect(screen.getByRole('button', { name: /sign up/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Complete security check' }));
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(mockSignUp).toHaveBeenCalledWith(
      'pat@example.com',
      'password123',
      {
        firstName: 'Pat',
        lastName: 'Morgan',
        roles: ['exhibitor'],
      },
      'turnstile-token'
    );
  });

  it('does not reuse one Turnstile token for simultaneous signup submissions', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    mockSignUp.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SignUpPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText(/first name/i), 'Pat');
    await user.type(screen.getByLabelText(/last name/i), 'Morgan');
    await user.type(screen.getByLabelText(/email address/i), 'pat@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByLabelText(/i agree to the/i));
    await user.click(screen.getByRole('button', { name: 'Complete security check' }));
    const form = screen.getByRole('button', { name: /sign up/i }).closest('form');
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(mockSignUp).toHaveBeenCalledTimes(1);
  });

  describe('resend confirmation email', () => {
    /** Fill the form with a valid exhibitor signup and submit to reach the "Check your email" screen. */
    async function reachConfirmationScreen(user: ReturnType<typeof userEvent.setup>) {
      mockSignUp.mockResolvedValue(undefined);

      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/first name/i), 'Pat');
      await user.type(screen.getByLabelText(/last name/i), 'Morgan');
      await user.type(screen.getByLabelText(/email address/i), 'pat@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');
      await user.click(screen.getByLabelText(/i agree to the/i));
      await user.click(screen.getByRole('button', { name: /sign up/i }));

      expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    }

    it('shows a Resend email button on the confirmation screen', async () => {
      const user = userEvent.setup();
      await reachConfirmationScreen(user);

      expect(screen.getByRole('button', { name: /resend email/i })).toBeInTheDocument();
    });

    it('resends to the registered email when clicked', async () => {
      const user = userEvent.setup();
      mockResendConfirmationEmail.mockResolvedValue(undefined);
      await reachConfirmationScreen(user);

      await user.click(screen.getByRole('button', { name: /resend email/i }));

      expect(mockResendConfirmationEmail).toHaveBeenCalledWith('pat@example.com');
    });

    it('disables the button and shows a countdown after a successful resend', async () => {
      const user = userEvent.setup();
      mockResendConfirmationEmail.mockResolvedValue(undefined);
      await reachConfirmationScreen(user);

      await user.click(screen.getByRole('button', { name: /resend email/i }));

      const button = screen.getByRole('button', { name: /resend email in \d+s/i });
      expect(button).toBeDisabled();
    });

    it('requires a fresh Turnstile token for confirmation resend when configured', async () => {
      vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
      const user = userEvent.setup();
      mockSignUp.mockResolvedValue(undefined);
      mockResendConfirmationEmail.mockResolvedValue(undefined);

      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      );

      await user.type(screen.getByLabelText(/first name/i), 'Pat');
      await user.type(screen.getByLabelText(/last name/i), 'Morgan');
      await user.type(screen.getByLabelText(/email address/i), 'pat@example.com');
      await user.type(screen.getByLabelText(/^password$/i), 'password123');
      await user.type(screen.getByLabelText(/confirm password/i), 'password123');
      await user.click(screen.getByLabelText(/i agree to the/i));
      await user.click(screen.getByRole('button', { name: 'Complete security check' }));
      await user.click(screen.getByRole('button', { name: /sign up/i }));

      expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
      const resend = screen.getByRole('button', { name: /resend email/i });
      expect(resend).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Complete security check' }));
      await user.click(resend);

      expect(mockResendConfirmationEmail).toHaveBeenCalledWith(
        'pat@example.com',
        'turnstile-token'
      );
    });
  });
});
