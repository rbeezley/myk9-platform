import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationManager, type MutationManagerOptions } from './MutationManager';

/**
 * MYK9-1204: a NEW queue entry's owner comes from the persisted account when the
 * live session cannot resolve (offline past jwt_expiry). A blocked storage getter
 * (browser privacy settings) makes that persisted read throw; it must fall
 * through to the live session, never reject the write.
 */

function manager(options: MutationManagerOptions) {
  return new MutationManager({} as SupabaseClient, {
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    ...options,
  });
}

const queueOwner = (m: MutationManager, liveDeadlineMs?: number) =>
  (
    m as unknown as { requireQueueOwnerUserId(deadline?: number): Promise<string> }
  ).requireQueueOwnerUserId(liveDeadlineMs);

const storageBlocked = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

describe('MutationManager queue owner (MYK9-1204)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offline with storage blocked, falls through to a live in-memory session', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const m = manager({
      getCurrentUserId: async () => 'live-user',
      getCachedUserId: storageBlocked,
    });
    await expect(queueOwner(m)).resolves.toBe('live-user');
  });

  it('online with the live lookup failing and storage blocked, rethrows the live error', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const m = manager({
      getCurrentUserId: async () => {
        throw new Error('AuthRetryableFetchError');
      },
      getCachedUserId: storageBlocked,
    });
    await expect(queueOwner(m)).rejects.toThrow('AuthRetryableFetchError');
  });

  it('offline with a persisted account, answers without waiting on the live lookup', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const getCurrentUserId = vi.fn(() => new Promise<string | null>(() => {}));
    const m = manager({ getCurrentUserId, getCachedUserId: () => 'cached-user' });
    await expect(queueOwner(m)).resolves.toBe('cached-user');
    expect(getCurrentUserId).not.toHaveBeenCalled();
  });
});

/**
 * MYK9-2479 (Codex round 7 on #4461): on captive Wi-Fi `navigator.onLine` stays true and an
 * expired token's refresh can hang. A caller that passes a deadline (desk payments) takes
 * the persisted account once it passes; a caller that passes none waits as before.
 */
describe('MutationManager queue owner with a live-lookup deadline (MYK9-2479)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('online with a hanging live lookup, answers the persisted account at the deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    const m = manager({
      getCurrentUserId: () => new Promise<string | null>(() => {}),
      getCachedUserId: () => 'cached-user',
    });
    const owner = queueOwner(m, 2_000);
    await vi.advanceTimersByTimeAsync(1_999);
    let settled = false;
    void owner.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(owner).resolves.toBe('cached-user');
  });

  it('a live answer inside the deadline wins over the persisted account', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const m = manager({
      getCurrentUserId: async () => 'live-user',
      getCachedUserId: () => 'cached-user',
    });
    await expect(queueOwner(m, 2_000)).resolves.toBe('live-user');
  });

  it('a hanging lookup with no persisted account rejects at the deadline, never hangs', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { onLine: true });
    const m = manager({
      getCurrentUserId: () => new Promise<string | null>(() => {}),
      getCachedUserId: () => null,
    });
    const owner = queueOwner(m, 2_000);
    const assertion = expect(owner).rejects.toThrow('Live account lookup took over 2000 ms');
    await vi.advanceTimersByTimeAsync(2_000);
    await assertion;
  });
});
