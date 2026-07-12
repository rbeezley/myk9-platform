import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getCurrentUserId } from './authHelpers';

describe('getCurrentUserId development mock guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  it('ignores attacker-controlled mock-user storage in production', () => {
    vi.stubEnv('DEV', false);
    localStorage.setItem('dev-current-mock-user', 'attacker-user');

    expect(getCurrentUserId()).toBe('system-user');
  });

  it('preserves mock-user storage in development', () => {
    vi.stubEnv('DEV', true);
    localStorage.setItem('dev-current-mock-user', 'secretary-user');

    expect(getCurrentUserId()).toBe('secretary-user');
  });
});
