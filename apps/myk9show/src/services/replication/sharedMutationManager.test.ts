import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSessionBoundSupabaseClient: vi.fn(),
  // Deliberately NOT reset (MYK9-669): written once, by the singleton's
  // constructor on the file's first import of `./sharedMutationManager`, and
  // read by every test afterwards. The import is cached, so a reset would null
  // it for good. The two mocks above are reset in `beforeEach`.
  managerOptions: null as Record<string, unknown> | null,
}));

vi.mock('@myk9/replication', () => ({
  MutationManager: class {
    constructor(_client: unknown, options: Record<string, unknown>) {
      hoisted.managerOptions = options;
    }
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { auth: { getSession: hoisted.getSession } },
  createSessionBoundSupabaseClient: hoisted.createSessionBoundSupabaseClient,
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('sharedMutationManager auth identity', () => {
  beforeEach(() => {
    hoisted.getSession.mockReset();
    hoisted.createSessionBoundSupabaseClient.mockReset();
  });

  it('pins upload execution to the exact resolved session token', async () => {
    const pinnedClient = { from: vi.fn(), rpc: vi.fn() };
    hoisted.createSessionBoundSupabaseClient.mockReturnValue(pinnedClient);
    hoisted.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token-a',
          user: { id: 'auth-user-1' },
        },
      },
      error: null,
    });
    await import('./sharedMutationManager');

    const getCurrentUploadContext = hoisted.managerOptions?.getCurrentUploadContext as
      (() => Promise<{ authUserId: string; supabaseClient: unknown } | null>) | undefined;
    await expect(getCurrentUploadContext?.()).resolves.toEqual({
      authUserId: 'auth-user-1',
      supabaseClient: pinnedClient,
    });
    await expect(getCurrentUploadContext?.()).resolves.toEqual({
      authUserId: 'auth-user-1',
      supabaseClient: pinnedClient,
    });
    expect(hoisted.createSessionBoundSupabaseClient).toHaveBeenCalledWith('session-token-a');
    expect(hoisted.createSessionBoundSupabaseClient).toHaveBeenCalledTimes(1);
  });

  it('resolves the exact locally cached Supabase session owner', async () => {
    hoisted.getSession.mockResolvedValue({
      data: { session: { user: { id: 'auth-user-1' } } },
      error: null,
    });
    await import('./sharedMutationManager');

    const getCurrentUserId = hoisted.managerOptions?.getCurrentUserId as
      (() => Promise<string | null>) | undefined;
    await expect(getCurrentUserId?.()).resolves.toBe('auth-user-1');
  });

  it('fails identity resolution when the local session read fails', async () => {
    hoisted.getSession.mockResolvedValue({
      data: { session: null },
      error: new Error('session storage unavailable'),
    });
    await import('./sharedMutationManager');

    const getCurrentUserId = hoisted.managerOptions?.getCurrentUserId as
      (() => Promise<string | null>) | undefined;
    await expect(getCurrentUserId?.()).rejects.toThrow('session storage unavailable');
  });

  // MYK9-1133: getSession() errors once the token expires offline, which would
  // leave every stamped replica scope reading as another account's. The stamp
  // check may fall back to the persisted session's user id; uploads and queue
  // ownership may not.
  describe('offline-durable identity for replica stamps', () => {
    const storageKey = 'sb-test-auth-token';

    beforeEach(() => {
      window.localStorage.removeItem(storageKey);
    });

    it('offers the persisted session user id, and nothing once the session is gone', async () => {
      await import('./sharedMutationManager');
      const getCachedUserId = hoisted.managerOptions?.getCachedUserId as
        (() => string | null) | undefined;

      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ access_token: 'expired', user: { id: 'auth-user-1' } })
      );
      expect(getCachedUserId?.()).toBe('auth-user-1');

      window.localStorage.removeItem(storageKey);
      expect(getCachedUserId?.()).toBeNull();
    });

    it('still refuses an upload context while the live session read fails', async () => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ access_token: 'expired', user: { id: 'auth-user-1' } })
      );
      hoisted.getSession.mockResolvedValue({
        data: { session: null },
        error: new Error('AuthRetryableFetchError'),
      });
      await import('./sharedMutationManager');

      const getCurrentUploadContext = hoisted.managerOptions?.getCurrentUploadContext as
        (() => Promise<unknown>) | undefined;
      await expect(getCurrentUploadContext?.()).rejects.toThrow('AuthRetryableFetchError');
      const getCurrentUserId = hoisted.managerOptions?.getCurrentUserId as
        (() => Promise<string | null>) | undefined;
      await expect(getCurrentUserId?.()).rejects.toThrow('AuthRetryableFetchError');
    });
  });
});
