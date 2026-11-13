/**
 * MYK9-1815: what the sign-in, sign-up and password pages say when the login provider
 * refuses. The provider's own text is never shown: it is written for developers and does
 * not say what to do next. Errors are told apart by their `code` (and HTTP status), never
 * by matching the provider's English.
 */
import { isCaptchaFailure } from '@/config/turnstile';

/** The one password rule, on every page that sets a password. */
export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_TOO_SHORT = `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`;

const AUTH_TOO_MANY_TRIES = 'Too many tries. Wait a minute, then try again.';
const AUTH_UNREACHABLE = 'Could not reach myK9Show. Check your connection and try again.';
const AUTH_SECURITY_CHECK = 'The security check did not finish. Wait a moment, then try again.';

export type AuthAction = 'signIn' | 'signUp' | 'resend' | 'google' | 'apple' | 'changePassword';

const FALLBACK: Record<AuthAction, string> = {
  signIn: 'We could not sign you in. Please try again.',
  signUp: 'We could not create your account. Please try again.',
  resend: 'We could not send the email. Wait a minute, then try again.',
  google: 'We could not open Google sign-in. Please try again.',
  apple: 'We could not open Apple sign-in. Please try again.',
  changePassword: 'We could not change your password. Please try again.',
};

const ALREADY_HAS_ACCOUNT =
  'That email address already has an account. Sign in, or use "Forgot your password?" on the sign-in page.';
const CODE_NOT_RIGHT =
  'That code is not right or has expired. Check the email, or ask for a new code.';

const BY_CODE: Record<string, string> = {
  invalid_credentials:
    'That email or password is not right. Check both and try again, or use "Forgot your password?" below.',
  email_not_confirmed:
    'Your email address is not confirmed yet. Open the email we sent you and use the link in it, then sign in. If you cannot find it, sign up again with the same email address to get a new one.',
  user_already_exists: ALREADY_HAS_ACCOUNT,
  email_exists: ALREADY_HAS_ACCOUNT,
  // The provider also calls a long but leaked or simple password weak, so do not blame length alone.
  weak_password: `That password is too short or too easy to guess. Use at least ${MIN_PASSWORD_LENGTH} characters and try a different one.`,
  same_password: 'That is the password you already have. Choose a different one.',
  email_address_invalid: 'That email address does not look right. Check it and try again.',
  reauthentication_not_valid: CODE_NOT_RIGHT,
  otp_expired: CODE_NOT_RIGHT,
};

/** The app's own timer fired before the login provider answered. Told apart by type, not text. */
export class AuthTimeoutError extends Error {
  constructor(message = 'The sign-in request timed out.') {
    super(message);
    this.name = 'AuthTimeoutError';
  }
}

/**
 * No answer from the network: our own timer, or the SDK's status 0 (how it reports a failed
 * fetch). A retryable 5xx from the server is not "no connection", and a bare TypeError is a
 * code bug, so neither counts.
 */
function isConnectionFailure(error: unknown, failure: AuthFailure): boolean {
  return error instanceof AuthTimeoutError || failure.status === 0;
}

export interface AuthFailure {
  status?: number | undefined;
  code?: string | undefined;
  message?: string | undefined;
}

function asFailure(error: unknown): AuthFailure {
  return typeof error === 'object' && error !== null ? (error as AuthFailure) : {};
}

/**
 * The failures every auth call shares: the security check, a rate limit, no connection.
 * Null when the error is none of those, so the caller can say what was wrong with what
 * the person typed.
 */
export function commonAuthFailure(error: unknown): string | null {
  const failure = asFailure(error);
  if (isCaptchaFailure(error)) return AUTH_SECURITY_CHECK;
  if (failure.status === 429 || failure.code?.startsWith('over_')) return AUTH_TOO_MANY_TRIES;
  // A known provider code always wins over connection handling.
  if (failure.code && failure.code in BY_CODE) return null;
  return isConnectionFailure(error, failure) ? AUTH_UNREACHABLE : null;
}

/** A plain sentence for a failed auth call. Never the provider's message. */
export function friendlyAuthError(error: unknown, action: AuthAction): string {
  return commonAuthFailure(error) ?? BY_CODE[asFailure(error).code ?? ''] ?? FALLBACK[action];
}
