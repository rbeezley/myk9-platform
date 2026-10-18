/**
 * MYK9-1208 (owner option 1): changing the password is a step-up action too.
 *
 * The server side is GoTrue's "Secure password change" (`auth.email.secure_password_change`):
 * a session older than 24 hours must present a nonce emailed by `reauthenticate()`. This is
 * the client's defense in depth on top of it: before `updateUser({ password })` the session
 * must have confirmed the password (or an emailed code) in the last few minutes, through the
 * same prompt refunds and role changes use. The reset-password page also accepts a fresh
 * recovery-link session, so a forgotten password can still be reset.
 *
 * If GoTrue still asks for reauthentication, a code is emailed and the caller shows a code
 * field; the change is retried with `updateUser({ password, nonce })`.
 */
import { supabase } from '@/services/database/supabaseClient';
import { requestStepUp } from './stepUpStore';
import { isFreshRecoverySession, isFreshlyReauthenticated } from './stepUpToken';

export const PASSWORD_STEP_UP_CANCELLED =
  'Your password was not changed. Confirm it is you to change it.';
export const PASSWORD_NONCE_SENT =
  "For your security, confirm it's you first. We've emailed you a code.";

/** GoTrue asked for a reauthentication nonce; one has been emailed. */
export class PasswordNonceRequired extends Error {
  constructor() {
    super(PASSWORD_NONCE_SENT);
  }
}

interface ChangePasswordOptions {
  /** The reset-password page: a fresh recovery-link session is confirmation enough. */
  acceptRecoverySession?: boolean;
  /** The code from the reauthentication email, when GoTrue asked for one. */
  nonce?: string;
}

function needsReauthentication(error: { code?: string | undefined; message?: string }): boolean {
  return (
    error.code === 'reauthentication_needed' ||
    /requires reauthentication/i.test(error.message ?? '')
  );
}

export async function changePassword(
  newPassword: string,
  { acceptRecoverySession = false, nonce }: ChangePasswordOptions = {}
): Promise<void> {
  if (!nonce) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    const fresh =
      isFreshlyReauthenticated(token) || (acceptRecoverySession && isFreshRecoverySession(token));
    if (!fresh && !(await requestStepUp(token))) throw new Error(PASSWORD_STEP_UP_CANCELLED);
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
    ...(nonce ? { nonce: nonce.replace(/\s+/g, '') } : {}),
  });
  if (!error) return;
  if (!nonce && needsReauthentication(error)) {
    const { error: sendError } = await supabase.auth.reauthenticate();
    if (sendError) throw sendError;
    throw new PasswordNonceRequired();
  }
  throw error;
}
