import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  createSessionBoundSupabaseClient: vi.fn(),
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
});
