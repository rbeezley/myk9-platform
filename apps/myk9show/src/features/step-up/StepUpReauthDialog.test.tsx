import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockSupabase } from '@/test/mocks/supabase';
import { renderWithProviders } from '@/test/utils/testUtils';
import { StepUpReauthHost } from './StepUpReauthDialog';
import { requestStepUp, resetStepUpStore, useStepUpStore } from './stepUpStore';

const USER_ID = 'auth-user-1';

function sessionFor(provider: 'email' | 'google', token = 'old-token') {
  return {
    access_token: token,
    user: {
      id: USER_ID,
      email: 'secretary@example.com',
      app_metadata: { provider, providers: [provider] },
      identities: [{ provider }],
    },
  };
}

function signedInAs(provider: 'email' | 'google') {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: sessionFor(provider) },
    error: null,
  });
}

const authError = (status: number, message: string) => ({
  data: { user: null, session: null },
  error: { status, message, code: status === 400 ? 'invalid_credentials' : undefined },
});

/**
 * Renders signed out, so the providers settle as a guest, then hands `getSession` the
 * account the prompt reads at the moment it is asked.
 */
async function openPrompt(provider: 'email' | 'google') {
  renderWithProviders(<StepUpReauthHost />);
  await waitFor(() => expect(useStepUpStore.getState().loadAccount).not.toBeNull());
  signedInAs(provider);
  let answer!: Promise<string | null>;
  act(() => {
    answer = requestStepUp();
  });
  // Wrapped: returning the bare promise from an async function would make `await` wait for
  // the person's answer instead of for the prompt.
  return { answer };
}

describe('StepUpReauthDialog', () => {
  beforeEach(() => {
    resetStepUpStore();
    mockSupabase.auth.signInWithPassword.mockReset();
    mockSupabase.auth.signInWithOtp.mockReset();
    mockSupabase.auth.verifyOtp.mockReset();
  });

  it('says plainly when the password is wrong, then accepts the right one', async () => {
    mockSupabase.auth.signInWithPassword
      .mockResolvedValueOnce(authError(400, 'Invalid login credentials'))
      .mockResolvedValueOnce({
        data: { user: { id: USER_ID }, session: sessionFor('email', 'new-token') },
        error: null,
      });
    const user = userEvent.setup();
    const { answer } = await openPrompt('email');

    expect(await screen.findByText('Confirm your password to continue')).toBeInTheDocument();
    const password = screen.getByLabelText('Password');
    await user.type(password, 'nope');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That password is not right. Try again, or email yourself a code instead.'
    );
    expect(mockSupabase.auth.signInWithPassword).toHaveBeenLastCalledWith({
      email: 'secretary@example.com',
      password: 'nope',
    });

    await user.clear(password);
    await user.type(password, 'right');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await expect(answer).resolves.toBe('new-token');
    await waitFor(() =>
      expect(screen.queryByText('Confirm your password to continue')).not.toBeInTheDocument()
    );
  });

  it('Cancel answers null, so the caller keeps its refusal', async () => {
    const user = userEvent.setup();
    const { answer } = await openPrompt('email');

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    await expect(answer).resolves.toBeNull();
    expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('an account with no password confirms with an emailed code', async () => {
    mockSupabase.auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    mockSupabase.auth.verifyOtp.mockResolvedValue({
      data: { user: { id: USER_ID }, session: sessionFor('google', 'otp-token') },
      error: null,
    });
    const user = userEvent.setup();
    const { answer } = await openPrompt('google');

    expect(await screen.findByText('Confirm it is you')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByText('Use my password instead')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(mockSupabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'secretary@example.com',
      options: { shouldCreateUser: false },
    });

    await user.type(await screen.findByLabelText('Code from the email'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirm code' }));

    expect(mockSupabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'secretary@example.com',
      token: '123456',
      type: 'email',
    });
    await expect(answer).resolves.toBe('otp-token');
  });

  it('refuses a session that came back for a different account', async () => {
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'someone-else' },
        session: { ...sessionFor('email', 'x'), user: { id: 'someone-else' } },
      },
      error: null,
    });
    const user = userEvent.setup();
    await openPrompt('email');

    await user.type(await screen.findByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That signed in a different account.'
    );
  });
});
