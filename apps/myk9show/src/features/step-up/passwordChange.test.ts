import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '@/test/mocks/supabase';
import {
  changePassword,
  PASSWORD_NONCE_SENT,
  PASSWORD_STEP_UP_CANCELLED,
  PasswordNonceRequired,
} from './passwordChange';
import { registerStepUpHost, resetStepUpStore, settleStepUp, useStepUpStore } from './stepUpStore';
import { testJwt } from './stepUpTestTokens';

const USER = 'auth-user-1';

function sessionWith(token: string) {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: token, user: { id: USER } } },
    error: null,
  });
}

describe('changePassword (MYK9-1208)', () => {
  beforeEach(() => {
    resetStepUpStore();
    mockSupabase.auth.updateUser.mockReset();
    mockSupabase.auth.updateUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSupabase.auth.reauthenticate.mockReset();
    mockSupabase.auth.reauthenticate.mockResolvedValue({ data: {}, error: null });
    registerStepUpHost(async () => ({ userId: USER, email: 'a@example.com', hasPassword: true }));
  });

  it('a stale session asks for the password first, then changes it', async () => {
    sessionWith(testJwt(USER, 3_600, 'stale'));
    const change = changePassword('new-password-1');

    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());
    expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled();
    settleStepUp(testJwt(USER, 1, 'fresh'));

    await change;
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-1' });
  });

  it('cancelling the prompt changes nothing', async () => {
    sessionWith(testJwt(USER, 3_600, 'stale'));
    const change = changePassword('new-password-1');
    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());
    settleStepUp(null);

    await expect(change).rejects.toThrow(PASSWORD_STEP_UP_CANCELLED);
    expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('a fresh confirmation goes straight through, with no prompt', async () => {
    sessionWith(testJwt(USER, 10, 'fresh'));
    await changePassword('new-password-1');
    expect(useStepUpStore.getState().promptId).toBe(0);
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'new-password-1' });
  });

  it('a recovery-link session can reset a forgotten password on the reset page only', async () => {
    sessionWith(testJwt(USER, 120, 'recovery', 'recovery'));
    await changePassword('new-password-1', { acceptRecoverySession: true });
    expect(useStepUpStore.getState().promptId).toBe(0);
    expect(mockSupabase.auth.updateUser).toHaveBeenCalledTimes(1);

    // The same session on the account page still has to confirm.
    const change = changePassword('new-password-2');
    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());
    settleStepUp(null);
    await expect(change).rejects.toThrow(PASSWORD_STEP_UP_CANCELLED);
  });

  it('when GoTrue wants the emailed code, sends it, then retries with the nonce', async () => {
    sessionWith(testJwt(USER, 10, 'fresh'));
    mockSupabase.auth.updateUser.mockResolvedValueOnce({
      data: { user: null },
      error: {
        status: 400,
        code: 'reauthentication_needed',
        message: 'Password update requires reauthentication',
      },
    });

    const first = changePassword('new-password-1');
    await expect(first).rejects.toBeInstanceOf(PasswordNonceRequired);
    await expect(first).rejects.toThrow(PASSWORD_NONCE_SENT);
    expect(mockSupabase.auth.reauthenticate).toHaveBeenCalledTimes(1);

    await changePassword('new-password-1', { nonce: '654 321' });
    expect(mockSupabase.auth.updateUser).toHaveBeenLastCalledWith({
      password: 'new-password-1',
      nonce: '654321',
    });
  });
});
