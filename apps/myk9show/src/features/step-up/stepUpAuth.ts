/**
 * MYK9-1208: how a signed-in person proves it is still them.
 *
 * Both paths sign the SAME account in again, which mints a fresh session whose JWT `amr`
 * claim says "password (or otp), just now". That claim is what the server checks. The
 * identity cannot change: the email comes from the current session, and a session for a
 * different user is refused.
 *
 * `supabase.auth.reauthenticate()` is not used: it only issues a nonce for `updateUser` and
 * leaves the session's `amr` untouched, so the server could never see it.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/database/supabaseClient';
import type { StepUpAccount } from './stepUpStore';

export class StepUpError extends Error {}

const MESSAGES = {
  wrongPassword: 'That password is not right. Try again, or email yourself a code instead.',
  wrongCode: 'That code is not right or has expired. Check the email, or send a new code.',
  tooMany: 'Too many tries. Wait a minute, then try again.',
  offline: 'Could not reach myK9Show. Check your connection and try again.',
  otherAccount: 'That signed in a different account. Sign out, then sign in as yourself.',
  generic: 'Something went wrong. Please try again.',
} as const;

export function accountFromSession(session: Session | null): StepUpAccount | null {
  const user = session?.user;
  if (!user?.email || user.is_anonymous) return null;
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword =
    (user.identities ?? []).some(identity => identity.provider === 'email') ||
    providers.includes('email');
  return { userId: user.id, email: user.email, hasPassword };
}

export async function loadStepUpAccount(): Promise<StepUpAccount | null> {
  const { data } = await supabase.auth.getSession();
  return accountFromSession(data.session);
}

interface AuthFailure {
  status?: number | undefined;
  code?: string | undefined;
  message?: string | undefined;
}

function friendly(error: AuthFailure, wrong: string) {
  if (error.status === 429 || error.code?.startsWith('over_')) return MESSAGES.tooMany;
  if (error.status === 0 || /fetch|network/i.test(error.message ?? '')) return MESSAGES.offline;
  if (error.status === 400 || error.status === 401 || error.status === 403) return wrong;
  return MESSAGES.generic;
}

function tokenFor(account: StepUpAccount, session: Session | null): string {
  if (!session?.access_token) throw new StepUpError(MESSAGES.generic);
  if (session.user.id !== account.userId) throw new StepUpError(MESSAGES.otherAccount);
  return session.access_token;
}

/** Signs the same account in again with its password; returns the new access token. */
export async function confirmWithPassword(
  account: StepUpAccount,
  password: string
): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: account.email,
    password,
  });
  if (error) throw new StepUpError(friendly(error, MESSAGES.wrongPassword));
  return tokenFor(account, data.session);
}

/** Emails a one-time sign-in code (and link) to the account's own address. */
export async function sendStepUpCode(account: StepUpAccount): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: account.email,
    options: { shouldCreateUser: false },
  });
  if (error) throw new StepUpError(friendly(error, MESSAGES.generic));
}

/** Verifies the emailed code; returns the new access token. */
export async function confirmWithCode(account: StepUpAccount, code: string): Promise<string> {
  const { data, error } = await supabase.auth.verifyOtp({
    email: account.email,
    token: code.replace(/\s+/g, ''),
    type: 'email',
  });
  if (error) throw new StepUpError(friendly(error, MESSAGES.wrongCode));
  return tokenFor(account, data.session);
}
