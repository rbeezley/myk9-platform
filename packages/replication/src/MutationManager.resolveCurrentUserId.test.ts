import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationManager, type MutationManagerOptions } from './MutationManager';

/**
 * MYK9-1133: `resolveCurrentUserId` names the account for the replica stamp.
 * The live lookup is tried first; only when it throws or yields no user does
 * the offline-durable cached id answer. The queue and upload paths keep
 * `requireCurrentUserId`, which never consults the cache.
 */

function manager(options: MutationManagerOptions) {
  return new MutationManager({} as SupabaseClient, {
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    ...options,
  });
}

describe('MutationManager.resolveCurrentUserId', () => {
  it('prefers the live lookup over the cached id', async () => {
    const m = manager({
      getCurrentUserId: async () => 'live-user',
      getCachedUserId: () => 'cached-user',
    });
    expect(await m.resolveCurrentUserId()).toBe('live-user');
  });

  it('falls back to the cached id when the live lookup throws (expired token offline)', async () => {
    const m = manager({
      getCurrentUserId: async () => {
        throw new Error('AuthRetryableFetchError');
      },
      getCachedUserId: () => 'cached-user',
    });
    expect(await m.resolveCurrentUserId()).toBe('cached-user');
  });

  it('falls back to the cached id when the live lookup yields no user', async () => {
    const m = manager({ getCurrentUserId: async () => null, getCachedUserId: () => 'cached-user' });
    expect(await m.resolveCurrentUserId()).toBe('cached-user');
  });

  it.each([
    ['no cached id', () => null],
    ['a blank cached id', () => '  '],
    [
      'a throwing cache',
      () => {
        throw new Error('storage');
      },
    ],
  ])('is null when the live lookup fails and there is %s', async (_name, getCachedUserId) => {
    const m = manager({
      getCurrentUserId: async () => {
        throw new Error('offline');
      },
      getCachedUserId,
    });
    expect(await m.resolveCurrentUserId()).toBeNull();
  });

  it('is null with neither source configured', async () => {
    expect(await manager({}).resolveCurrentUserId()).toBeNull();
  });

  it('never lends the cached id to queue operations', async () => {
    const m = manager({
      getCurrentUserId: async () => {
        throw new Error('offline');
      },
      getCachedUserId: () => 'cached-user',
    });
    await expect(m.getFailedMutations()).rejects.toThrow();
  });
});
