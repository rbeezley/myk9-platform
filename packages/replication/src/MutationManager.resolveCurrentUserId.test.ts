import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationManager, type MutationManagerOptions } from './MutationManager';

/**
 * MYK9-1133: `resolveCurrentUserId` names the account for the replica stamp.
 * It answers from the persisted session first, a synchronous read that never
 * waits on the network: with an expired token offline the live lookup retries
 * its refresh with backoff for tens of seconds, and guarded IndexedDB reads
 * must not wait on that. The live lookup answers only when nothing is
 * persisted. The queue and upload paths keep `requireCurrentUserId`, which
 * never consults the cache.
 */

function manager(options: MutationManagerOptions) {
  return new MutationManager({} as SupabaseClient, {
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    ...options,
  });
}

const offline = () => {
  throw new Error('AuthRetryableFetchError');
};

describe('MutationManager.resolveCurrentUserId', () => {
  it('answers from the persisted id without waiting on a live lookup that never resolves', async () => {
    const getCurrentUserId = vi.fn(() => new Promise<string | null>(() => {}));
    const m = manager({ getCurrentUserId, getCachedUserId: () => 'cached-user' });

    expect(await m.resolveCurrentUserId()).toBe('cached-user');
    expect(getCurrentUserId).not.toHaveBeenCalled();
  });

  it('falls back to the live lookup when nothing is persisted', async () => {
    const m = manager({ getCurrentUserId: async () => 'live-user', getCachedUserId: () => null });
    expect(await m.resolveCurrentUserId()).toBe('live-user');
  });

  it('falls back to the live lookup when the persisted id is blank or the read throws', async () => {
    const blank = manager({
      getCurrentUserId: async () => 'live-user',
      getCachedUserId: () => '  ',
    });
    expect(await blank.resolveCurrentUserId()).toBe('live-user');
    const throwing = manager({
      getCurrentUserId: async () => 'live-user',
      getCachedUserId: offline,
    });
    expect(await throwing.resolveCurrentUserId()).toBe('live-user');
  });

  it('uses the live lookup alone when no cache is configured', async () => {
    expect(
      await manager({ getCurrentUserId: async () => 'live-user' }).resolveCurrentUserId()
    ).toBe('live-user');
  });

  it.each([
    ['the live lookup throws', async () => offline()],
    ['the live lookup yields no user', async () => null],
  ])('is null with nothing persisted when %s', async (_name, getCurrentUserId) => {
    const m = manager({ getCurrentUserId, getCachedUserId: () => null });
    expect(await m.resolveCurrentUserId()).toBeNull();
  });

  it('is null with neither source configured', async () => {
    expect(await manager({}).resolveCurrentUserId()).toBeNull();
  });

  it('never lends the cached id to queue operations', async () => {
    const m = manager({
      getCurrentUserId: async () => offline(),
      getCachedUserId: () => 'cached-user',
    });
    await expect(m.getFailedMutations()).rejects.toThrow();
  });
});
