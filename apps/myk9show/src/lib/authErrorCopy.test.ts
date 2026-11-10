/**
 * MYK9-1815: sign-in, sign-up and password pages never show the login provider's own text.
 * Errors are told apart by their CODE; the provider's English is free to change.
 */
import { describe, expect, it } from 'vitest';
import {
  commonAuthFailure,
  friendlyAuthError,
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_SHORT,
} from './authErrorCopy';

const authError = (code: string, status = 400, message = 'provider text that must never show') =>
  Object.assign(new Error(message), { code, status, __isAuthError: true });

describe('friendlyAuthError', () => {
  it('wrong email or password says to check both and names the way out', () => {
    expect(friendlyAuthError(authError('invalid_credentials'), 'signIn')).toBe(
      'That email or password is not right. Check both and try again, or use "Forgot your password?" below.'
    );
  });

  it('an unconfirmed email points at the confirmation email', () => {
    expect(friendlyAuthError(authError('email_not_confirmed'), 'signIn')).toBe(
      'Your email address is not confirmed yet. Open the email we sent you and use the link in it, then sign in.'
    );
  });

  it.each(['user_already_exists', 'email_exists'])(
    'an email that already has an account (%s) says to sign in instead',
    code => {
      expect(friendlyAuthError(authError(code, 422), 'signUp')).toBe(
        'That email address already has an account. Sign in, or use "Forgot your password?" on the sign-in page.'
      );
    }
  );

  it.each([
    ['over_request_rate_limit', 429],
    ['over_email_send_rate_limit', 429],
    ['anything_else', 429],
  ])('too many tries (%s) says to wait', (code, status) => {
    expect(friendlyAuthError(authError(code, status), 'signIn')).toBe(
      'Too many tries. Wait a minute, then try again.'
    );
  });

  it.each([
    ['a dropped connection', Object.assign(new Error('Failed to fetch'), { status: 0 })],
    ['a network error', new TypeError('NetworkError when attempting to fetch resource.')],
    ['the sign-in timeout', new Error('Sign-in request timed out. Check your connection.')],
  ])('%s says to check the connection', (_label, error) => {
    expect(friendlyAuthError(error, 'signIn')).toBe(
      'Could not reach myK9Show. Check your connection and try again.'
    );
  });

  it('a failed security check says to wait and try again', () => {
    expect(friendlyAuthError(authError('captcha_failed'), 'signUp')).toBe(
      'The security check did not finish. Wait a moment, then try again.'
    );
  });

  it('a password the provider calls weak says why, without blaming length alone', () => {
    expect(friendlyAuthError(authError('weak_password', 422), 'signUp')).toBe(
      'That password is too short or too easy to guess. Use at least 8 characters and try a different one.'
    );
    expect(PASSWORD_TOO_SHORT).toContain(String(MIN_PASSWORD_LENGTH));
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('reusing the current password asks for a different one', () => {
    expect(friendlyAuthError(authError('same_password', 422), 'changePassword')).toBe(
      'That is the password you already have. Choose a different one.'
    );
  });

  it.each(['reauthentication_not_valid', 'otp_expired'])(
    'a wrong or expired emailed code (%s) says so',
    code => {
      expect(friendlyAuthError(authError(code), 'changePassword')).toBe(
        'That code is not right or has expired. Check the email, or ask for a new code.'
      );
    }
  );

  it('an email address the provider refuses asks her to check it', () => {
    expect(friendlyAuthError(authError('email_address_invalid'), 'signUp')).toBe(
      'That email address does not look right. Check it and try again.'
    );
  });

  it.each([
    ['signIn', 'We could not sign you in. Please try again.'],
    ['signUp', 'We could not create your account. Please try again.'],
    ['resend', 'We could not send the email. Wait a minute, then try again.'],
    ['google', 'We could not open Google sign-in. Please try again.'],
    ['apple', 'We could not open Apple sign-in. Please try again.'],
    ['changePassword', 'We could not change your password. Please try again.'],
  ] as const)(
    'an error it does not know (%s) gets a plain fallback, never the raw text',
    (action, copy) => {
      const shown = friendlyAuthError(authError('unexpected_failure', 500), action);
      expect(shown).toBe(copy);
      expect(shown).not.toContain('provider text');
    }
  );

  it('never passes through a thrown value that is not an Error', () => {
    expect(friendlyAuthError('Invalid login credentials', 'signIn')).toBe(
      'We could not sign you in. Please try again.'
    );
    expect(friendlyAuthError(undefined, 'signIn')).toBe(
      'We could not sign you in. Please try again.'
    );
  });
});

describe('commonAuthFailure', () => {
  it('answers null for an error that is not a security check, rate limit or connection problem', () => {
    expect(commonAuthFailure(authError('invalid_credentials'))).toBeNull();
  });
});
