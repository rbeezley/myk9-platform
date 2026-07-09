import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage, __resetPersistentStorageCache } from './persistentStorage';

function setStorage(value: unknown) {
  Object.defineProperty(navigator, 'storage', { value, configurable: true });
}

describe('requestPersistentStorage', () => {
  afterEach(() => {
    __resetPersistentStorageCache();
    vi.restoreAllMocks();
  });

  it('returns "persisted" when already persisted (without re-requesting)', async () => {
    const persist = vi.fn();
    setStorage({ persisted: vi.fn().mockResolvedValue(true), persist });

    await expect(requestPersistentStorage()).resolves.toBe('persisted');
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests and returns "persisted" when the grant succeeds', async () => {
    setStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(true),
    });
    await expect(requestPersistentStorage()).resolves.toBe('persisted');
  });

  it('returns "not-persisted" when the grant is denied', async () => {
    setStorage({
      persisted: vi.fn().mockResolvedValue(false),
      persist: vi.fn().mockResolvedValue(false),
    });
    await expect(requestPersistentStorage()).resolves.toBe('not-persisted');
  });

  it('returns "unsupported" when the API is absent', async () => {
    setStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toBe('unsupported');
  });

  it('memoizes: a second call does not re-invoke persist()', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    setStorage({ persisted: vi.fn().mockResolvedValue(false), persist });

    await requestPersistentStorage();
    await requestPersistentStorage();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
