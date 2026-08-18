import { describe, it, expect, afterEach, vi } from 'vitest';
import { getUserFriendlyError } from './errorMessages';
import {
  SIGN_IN_EMAIL_LOCKED_CODE,
  SIGN_IN_EMAIL_LOCKED_MESSAGE,
  SIGN_IN_EMAIL_UNVERIFIABLE_CODE,
  SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE,
} from './signInEmailMessages';

describe('getUserFriendlyError fallback', () => {
  // An unmapped error (no recognized code) must surface the caller's contextual
  // fallback rather than the generic default — so the person-delete handlers can
  // say "Failed to delete user" instead of "Something went wrong". This holds in
  // both dev and prod branches (a plain object is neither an Error nor a string).
  it('returns the provided fallback for an unrecognized error', () => {
    expect(getUserFriendlyError({}, 'Failed to delete user')).toBe('Failed to delete user');
    expect(getUserFriendlyError(undefined, 'Failed to delete user')).toBe('Failed to delete user');
  });
});

// MYK9-136. This function discards the original message in production and maps
// by code alone, so a refusal whose whole value is its explanation has to be a
// code the map knows — otherwise the operator is told "Failed to update user"
// and has no idea why, or that there is a working alternative.
describe('sign-in email refusals in production builds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('explains why a linked person’s email cannot be changed', () => {
    vi.stubEnv('DEV', false);

    expect(getUserFriendlyError({ code: SIGN_IN_EMAIL_LOCKED_CODE }, 'Failed to update user')).toBe(
      SIGN_IN_EMAIL_LOCKED_MESSAGE
    );
  });

  it('asks the operator to retry when the identity could not be verified', () => {
    vi.stubEnv('DEV', false);

    expect(
      getUserFriendlyError({ code: SIGN_IN_EMAIL_UNVERIFIABLE_CODE }, 'Failed to update user')
    ).toBe(SIGN_IN_EMAIL_UNVERIFIABLE_MESSAGE);
  });
});
