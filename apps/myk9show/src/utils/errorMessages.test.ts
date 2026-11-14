import { describe, it, expect, afterEach, vi } from 'vitest';
import { GENERIC_FAILURE_MESSAGE, getUserFriendlyError } from './errorMessages';
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

// MYK9-923. The entries trigger refuses an entry under a deleted class, trial or
// show with SQLSTATE MK014, from every writer (checkout, desk entry, class
// change). In production the raw message is discarded, so the code must map.
describe('entry under a deleted parent in production builds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('says the class, trial or show was deleted instead of a generic failure', () => {
    vi.stubEnv('DEV', false);

    expect(
      getUserFriendlyError(
        {
          code: 'MK014',
          message: 'This class has been deleted, so it can no longer take entries.',
        },
        'Failed to create entry'
      )
    ).toBe(
      'This class, trial or show has been deleted, so it can no longer take entries. Refresh to see the current schedule.'
    );
  });
});

// MYK9-1843: the generic sentences follow the house pattern, and the default no
// longer reads like a developer log.
describe('generic failure sentences in production builds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the plain default when no fallback is given', () => {
    vi.stubEnv('DEV', false);

    expect(getUserFriendlyError({})).toBe(GENERIC_FAILURE_MESSAGE);
    expect(GENERIC_FAILURE_MESSAGE).toBe("We couldn't do that. Try again.");
  });

  it('maps PostgREST and missing-relation codes to the same plain sentence', () => {
    vi.stubEnv('DEV', false);

    expect(getUserFriendlyError({ code: 'PGRST301' })).toBe(GENERIC_FAILURE_MESSAGE);
    expect(getUserFriendlyError({ code: '42P01' })).toBe(GENERIC_FAILURE_MESSAGE);
  });
});

// MYK9-1817: a constraint failure names what failed and what to do next, in
// plain words, so nobody is left at a dead end ("This record already exists.").
describe('integrity-constraint messages in production builds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [
      '23505',
      "We couldn't save this because one like it already exists. Check the list, then try again.",
    ],
    [
      '23503',
      "We couldn't do that because other records still use it. Remove or reassign them, then try again.",
    ],
    [
      '23502',
      "We couldn't save this because a required field is empty. Fill it in, then try again.",
    ],
    [
      '23514',
      "We couldn't save this because a value is out of range. Check your entries, then try again.",
    ],
  ])('maps SQLSTATE %s to a message with a next step', (code, message) => {
    vi.stubEnv('DEV', false);

    expect(getUserFriendlyError({ code })).toBe(message);
    expect(message).not.toContain('—');
  });
});
