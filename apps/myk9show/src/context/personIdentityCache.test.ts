import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PERSON_IDENTITY_CACHE_TTL_MS,
  clearPersonIdentityCache,
  loadPersonIdentityCache,
  savePersonIdentityCache,
} from './personIdentityCache';

const USER_ID = 'user-1';
const PERSON_ID = 'person-1';

describe('personIdentityCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('round-trips a saved user/person pairing', () => {
    savePersonIdentityCache(USER_ID, PERSON_ID);

    expect(loadPersonIdentityCache(USER_ID)).toMatchObject({
      userId: USER_ID,
      personId: PERSON_ID,
    });
  });

  it("does not expose another account's pairing", () => {
    savePersonIdentityCache(USER_ID, PERSON_ID);

    expect(loadPersonIdentityCache('user-2')).toBeNull();
  });

  it('rejects malformed entries and removes them', () => {
    localStorage.setItem(
      `myk9show:person-identity-cache:${USER_ID}`,
      JSON.stringify({ userId: USER_ID, personId: 42, cachedAt: new Date().toISOString() })
    );

    expect(loadPersonIdentityCache(USER_ID)).toBeNull();
    expect(localStorage.getItem(`myk9show:person-identity-cache:${USER_ID}`)).toBeNull();
  });

  it('rejects entries older than the cache TTL', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now - PERSON_IDENTITY_CACHE_TTL_MS - 1);
    savePersonIdentityCache(USER_ID, PERSON_ID);
    vi.setSystemTime(now);

    expect(loadPersonIdentityCache(USER_ID)).toBeNull();
  });

  it('rejects entries dated in the future', () => {
    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    localStorage.setItem(
      `myk9show:person-identity-cache:${USER_ID}`,
      JSON.stringify({
        userId: USER_ID,
        personId: PERSON_ID,
        cachedAt: new Date(now + 1).toISOString(),
      })
    );

    expect(loadPersonIdentityCache(USER_ID)).toBeNull();
    expect(localStorage.getItem(`myk9show:person-identity-cache:${USER_ID}`)).toBeNull();
  });

  it('rejects entries with malformed timestamps', () => {
    localStorage.setItem(
      `myk9show:person-identity-cache:${USER_ID}`,
      JSON.stringify({ userId: USER_ID, personId: PERSON_ID, cachedAt: 'not-a-timestamp' })
    );

    expect(loadPersonIdentityCache(USER_ID)).toBeNull();
    expect(localStorage.getItem(`myk9show:person-identity-cache:${USER_ID}`)).toBeNull();
  });

  it('clears only the requested account', () => {
    savePersonIdentityCache(USER_ID, PERSON_ID);
    savePersonIdentityCache('user-2', 'person-2');

    clearPersonIdentityCache(USER_ID);

    expect(loadPersonIdentityCache(USER_ID)).toBeNull();
    expect(loadPersonIdentityCache('user-2')?.personId).toBe('person-2');
  });

  it('treats storage failures as best effort', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    expect(() => savePersonIdentityCache(USER_ID, PERSON_ID)).not.toThrow();
    setItem.mockRestore();

    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => loadPersonIdentityCache(USER_ID)).not.toThrow();
    getItem.mockRestore();

    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(() => clearPersonIdentityCache(USER_ID)).not.toThrow();
    removeItem.mockRestore();
  });
});
