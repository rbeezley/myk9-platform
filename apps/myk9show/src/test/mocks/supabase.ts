import { vi } from 'vitest';

/**
 * Default resolved value for any Supabase query chain.
 * Override per-test with createChainableQuery({ data: [...], error: null }).
 */
const DEFAULT_RESPONSE = { data: [], error: null, count: null, status: 200, statusText: 'OK' };

/**
 * Creates a Proxy-based query builder that supports infinite chaining.
 * Any property access returns a vi.fn() that returns another chainable proxy.
 * When awaited (.then), resolves to `resolvedValue`.
 */
export function createChainableQuery(resolvedValue: Record<string, unknown> = DEFAULT_RESPONSE) {
  const fns = new Map<string | symbol, ReturnType<typeof vi.fn>>();

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // When awaited, resolve with the configured value
      if (prop === 'then') {
        return (resolve: (value: unknown) => void) => resolve(resolvedValue);
      }
      // Return the same vi.fn() for repeated access to the same property
      if (!fns.has(prop)) {
        fns.set(
          prop,
          vi.fn(() => new Proxy({}, handler))
        );
      }
      return fns.get(prop);
    },
  };

  return new Proxy({}, handler);
}

/**
 * Creates a mock Supabase client with all top-level methods stubbed.
 * .from() returns a chainable query by default.
 * .auth, .channel, .removeChannel are stubbed.
 */
export function createMockSupabase() {
  const mockFrom = vi.fn(() => createChainableQuery());

  const mockAuth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signInWithPassword: vi
      .fn()
      .mockResolvedValue({ data: { user: null, session: null }, error: null }),
    signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: '', provider: '' }, error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
  };

  const mockChannel = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ status: 'SUBSCRIBED' }),
    unsubscribe: vi.fn(),
  });

  return {
    from: mockFrom,
    auth: mockAuth,
    channel: mockChannel,
    removeChannel: vi.fn(),
    rpc: vi.fn(() => createChainableQuery()),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: '' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
        download: vi.fn().mockResolvedValue({ data: new Blob(), error: null }),
      }),
    },
  };
}

/** Singleton instance used by the global mock in setup.ts */
export const mockSupabase = createMockSupabase();

/**
 * Reset all mocks to defaults. Call in beforeEach to prevent test leakage.
 */
export function resetMockSupabase() {
  mockSupabase.from.mockImplementation(() => createChainableQuery());
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockSupabase.rpc.mockImplementation(() => createChainableQuery());
}
