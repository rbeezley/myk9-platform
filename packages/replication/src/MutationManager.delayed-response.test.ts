import { createClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const AUTH_USER_ID = 'delayed-response-user';

function createLogger(): Logger {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('MutationManager delayed server responses', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;

  beforeEach(async () => {
    db = await createMutationManagerTestDb(
      `mutation-manager-delayed-response-${crypto.randomUUID()}`
    );
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);

    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-26T18:00:00.000Z'));

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
    });
  });

  afterEach(() => {
    manager?.destroy();
    db?.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('starts the full containment delay when a slow RS429 response arrives', async () => {
    const response = new Response(
      JSON.stringify({
        code: 'RS429',
        message: 'Ringside scoring contained; retries paused',
        details: '9',
        hint: 'retry_after=60',
      }),
      { status: 429, headers: { 'content-type': 'application/json' } }
    );
    let releaseResponse: (() => void) | undefined;
    let announceRequestStarted: (() => void) | undefined;
    const requestStarted = new Promise<void>(resolve => {
      announceRequestStarted = resolve;
    });
    const fetch = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          releaseResponse = () => resolve(response);
          announceRequestStarted?.();
        })
    );
    const supabase = createClient('https://example.supabase.co', 'test-anon-key', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { fetch },
    });
    manager = new MutationManager(supabase, {
      logger: createLogger(),
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({
        authUserId: AUTH_USER_ID,
        supabaseClient: supabase,
      }),
    });
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1', run_order: 3 },
      undefined,
      5,
      { name: 'ringside_update_entry', fields: { run_order: 3 } },
      false
    );

    const upload = manager.uploadPendingMutations();
    await requestStarted;
    vi.setSystemTime(new Date('2026-08-26T18:00:10.000Z'));
    releaseResponse?.();
    await upload;

    const containmentEvent = vi
      .mocked(window.dispatchEvent)
      .mock.calls.map(([event]) => event as CustomEvent<{ until: number }>)
      .find(event => event.type === 'replication:containment');

    expect(containmentEvent).toBeDefined();
    expect(containmentEvent!.detail.until - Date.now()).toBeGreaterThanOrEqual(59_000);
    expect(await manager.getPendingCount()).toBe(1);
  });

  it('aborts a timed-out RPC transport before a retry can overlap it', async () => {
    let activeRequests = 0;
    let peakActiveRequests = 0;
    let requestCount = 0;
    const requestSignals: Array<AbortSignal | undefined> = [];
    let announceFirstRequest: (() => void) | undefined;
    const firstRequestStarted = new Promise<void>(resolve => {
      announceFirstRequest = resolve;
    });
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      requestCount += 1;
      requestSignals.push(signal ?? undefined);
      activeRequests += 1;
      peakActiveRequests = Math.max(peakActiveRequests, activeRequests);

      if (requestCount === 1) {
        announceFirstRequest?.();
        return new Promise<Response>((_, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              activeRequests -= 1;
              reject(new DOMException('Request aborted', 'AbortError'));
            },
            { once: true }
          );
        });
      }

      activeRequests -= 1;
      return Promise.resolve(
        new Response('10', { status: 200, headers: { 'content-type': 'application/json' } })
      );
    });
    const supabase = createClient('https://example.supabase.co', 'test-anon-key', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { fetch },
    });
    manager = new MutationManager(supabase, {
      logger: createLogger(),
      retryBackoffBase: 30_000,
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({
        authUserId: AUTH_USER_ID,
        supabaseClient: supabase,
      }),
    });
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-2',
      { id: 'entry-2', run_order: 4 },
      undefined,
      5,
      { name: 'ringside_update_entry', fields: { run_order: 4 } },
      false
    );

    const firstUpload = manager.uploadPendingMutations();
    await firstRequestStarted;
    await vi.advanceTimersByTimeAsync(16_000);
    await firstUpload;

    expect(requestSignals[0]?.aborted).toBe(true);
    expect(activeRequests).toBe(0);

    manager.destroy();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    await manager.uploadPendingMutations();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(peakActiveRequests).toBe(1);
    expect(await manager.getPendingCount()).toBe(0);
  });

  it('starts OCC backoff when a slow conflict response arrives', async () => {
    const response = new Response(
      JSON.stringify({
        code: '40001',
        message: 'version conflict',
        details: '9',
        hint: null,
      }),
      { status: 409, headers: { 'content-type': 'application/json' } }
    );
    let releaseResponse: (() => void) | undefined;
    let announceRequestStarted: (() => void) | undefined;
    const requestStarted = new Promise<void>(resolve => {
      announceRequestStarted = resolve;
    });
    const fetch = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          releaseResponse = () => resolve(response);
          announceRequestStarted?.();
        })
    );
    const supabase = createClient('https://example.supabase.co', 'test-anon-key', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { fetch },
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    manager = new MutationManager(supabase, {
      logger: createLogger(),
      retryBackoffBase: 30_000,
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({
        authUserId: AUTH_USER_ID,
        supabaseClient: supabase,
      }),
    });
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-3',
      { id: 'entry-3', run_order: 5 },
      undefined,
      5,
      { name: 'ringside_update_entry', fields: { run_order: 5 } },
      false
    );

    const upload = manager.uploadPendingMutations();
    await requestStarted;
    vi.setSystemTime(new Date('2026-08-26T18:00:10.000Z'));
    releaseResponse?.();
    await upload;

    const [queued] = await manager.getPendingMutationsForRow('entries', 'entry-3');
    expect(queued?.nextRetryAt).toBeDefined();
    expect(queued!.nextRetryAt! - Date.now()).toBeGreaterThanOrEqual(29_000);
  });
});
