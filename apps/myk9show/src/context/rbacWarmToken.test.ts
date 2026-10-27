import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RBAC_WARM_MAX_AGE_MS,
  clearAllRbacWarmTokens,
  clearRbacWarmToken,
  hasFreshRbacWarmToken,
  saveRbacWarmToken,
} from './rbacWarmToken';

const put = (userId: string, verifiedAt: string, storedUserId = userId) =>
  localStorage.setItem(
    `myk9show:rbac-warm:${userId}`,
    JSON.stringify({ userId: storedUserId, verifiedAt })
  );

describe('rbacWarmToken', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('accepts a fresh token for the same user only', () => {
    saveRbacWarmToken('user-a');
    expect(hasFreshRbacWarmToken('user-a')).toBe(true);
    expect(hasFreshRbacWarmToken('user-b')).toBe(false);
  });

  it('rejects a token whose stored user id differs from its key', () => {
    put('user-b', new Date().toISOString(), 'user-a');
    expect(hasFreshRbacWarmToken('user-b')).toBe(false);
  });

  it('rejects a token older than 24h and accepts one just inside', () => {
    put('user-a', new Date(Date.now() - RBAC_WARM_MAX_AGE_MS - 60_000).toISOString());
    expect(hasFreshRbacWarmToken('user-a')).toBe(false);
    put('user-a', new Date(Date.now() - RBAC_WARM_MAX_AGE_MS + 60_000).toISOString());
    expect(hasFreshRbacWarmToken('user-a')).toBe(true);
  });

  it('rejects a future-dated token beyond skew but tolerates a minute', () => {
    put('user-a', new Date(Date.now() + 60 * 60_000).toISOString());
    expect(hasFreshRbacWarmToken('user-a')).toBe(false);
    put('user-a', new Date(Date.now() + 60_000).toISOString());
    expect(hasFreshRbacWarmToken('user-a')).toBe(true);
  });

  it('rejects garbage', () => {
    localStorage.setItem('myk9show:rbac-warm:user-a', '{not json');
    expect(hasFreshRbacWarmToken('user-a')).toBe(false);
  });

  it('clear and clearAll remove tokens and nothing else', () => {
    saveRbacWarmToken('user-a');
    saveRbacWarmToken('user-b');
    localStorage.setItem('myk9show:rbac-cache:user-a', 'keep');
    clearRbacWarmToken('user-a');
    expect(hasFreshRbacWarmToken('user-a')).toBe(false);
    expect(hasFreshRbacWarmToken('user-b')).toBe(true);
    clearAllRbacWarmTokens();
    expect(hasFreshRbacWarmToken('user-b')).toBe(false);
    expect(localStorage.getItem('myk9show:rbac-cache:user-a')).toBe('keep');
  });
});
