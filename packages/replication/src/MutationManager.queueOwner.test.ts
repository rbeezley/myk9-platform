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

const queueOwner = (m: MutationManager) =>
  (m as unknown as { requireQueueOwnerUserId(): Promise<string> }).requireQueueOwnerUserId();

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
