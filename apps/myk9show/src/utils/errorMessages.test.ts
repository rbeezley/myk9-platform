import { describe, it, expect } from 'vitest';
import { getUserFriendlyError } from './errorMessages';

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
