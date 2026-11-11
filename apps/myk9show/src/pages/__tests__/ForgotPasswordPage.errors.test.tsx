import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ForgotPasswordPage from '../ForgotPasswordPage';

const { resetPassword } = vi.hoisted(() => ({ resetPassword: vi.fn() }));
vi.mock('@/hooks/useAuthContext', () => ({ useAuthContext: () => ({ resetPassword }) }));
vi.mock('@/config/turnstile', async importOriginal => ({
  ...(await importOriginal<typeof import('@/config/turnstile')>()),
  getTurnstileSiteKey: () => '',
}));

async function submitReset() {
  const { user } = render(<ForgotPasswordPage />);
  await user.type(screen.getByLabelText('Email address'), 'person@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Send Reset Link' }));
}

describe('password reset outcomes', () => {
  beforeEach(() => {
    resetPassword.mockReset();
  });

  it('shows a retryable connection error instead of claiming an offline email was sent', async () => {
    resetPassword.mockRejectedValue(new AuthRetryableFetchError('TypeError: Failed to fetch', 0));
    await submitReset();
    expect(await screen.findByText(/could not reach myK9Show/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send Reset Link' })).toBeEnabled();
  });

  it('does not claim a reset email was sent when the auth service is unavailable', async () => {
    resetPassword.mockRejectedValue(new AuthRetryableFetchError('upstream unavailable', 503));
    await submitReset();
    expect(await screen.findByText(/couldn't send the reset link/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });

  it.each(['accepted', 'unknown account'])(
    'does not disclose account existence: %s',
    async outcome => {
      if (outcome === 'unknown account') {
        resetPassword.mockRejectedValue(new AuthApiError('User not found', 400, 'user_not_found'));
      } else {
        resetPassword.mockResolvedValue(undefined);
      }
      await submitReset();
      expect(await screen.findByText(/if an account exists for this email/i)).toBeInTheDocument();
      expect(screen.queryByText(/user not found/i)).not.toBeInTheDocument();
    }
  );
});
