import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { MutationManager } from './MutationManager';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import type { PendingMutation } from './types';

const PENDING = REPLICATION_STORES.PENDING_MUTATIONS;
const AUTH = 'test-user';

function mutation(id: string, rowId: string, timestamp: number): PendingMutation {
  return {
    id,
    authUserId: AUTH,
    tableName: 'entries',
    operation: 'UPDATE',
    rowId,
    data: { score: 1 },
    timestamp,
    retries: 0,
    status: 'pending',
  };
}

/**
 * Fake transport. `hang` rows return a thenable that never settles unless the
 * request's abort signal fires (then rejects, like fetch). Others succeed.
 */
function createTransport() {
  const sent: string[] = [];
  const hang = new Set<string>();
  const supabase = {
    from: vi.fn(() => ({
      update: () => ({
        eq: (_col: string, rowId: string) => {
          let signal: AbortSignal | undefined;
          const builder = {
            select: () => builder,
            abortSignal: (s: AbortSignal) => {
              signal = s;
              return builder;
            },
            then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
              sent.push(rowId);
              if (!hang.has(rowId)) {
                resolve({ data: [{ id: rowId, version: 2 }], error: null, status: 200 });
                return;
              }
              signal?.addEventListener('abort', () => reject(signal?.reason), { once: true });
            },
          };
          return builder;
        },
      }),
    })),
  } as unknown as SupabaseClient;
  return { supabase, sent, hang };
}

describe('MutationManager cancellable upload (MYK9-1550)', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;
  let transport: ReturnType<typeof createTransport>;

  beforeEach(async () => {
    db = await createMutationManagerTestDb('test-mutation-manager-abort-db', {
      includeSyncMetadata: true,
    });
    await db.clear(PENDING);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);
    const store: Record<string, string> = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

    transport = createTransport();
    manager = new MutationManager(transport.supabase, {
      maxRetries: 3,
      retryBackoffBase: 1_000,
      logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({
        authUserId: AUTH,
        supabaseClient: transport.supabase,
      }),
    });
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
  });

  const pendingIds = async () =>
    ((await db.getAll(PENDING)) as PendingMutation[]).map(m => m.id).sort();

  async function waitForSend(rowId: string) {
    await vi.waitFor(() => expect(transport.sent).toContain(rowId));
  }

  it('abort releases the lock and clears uploadInFlight; the mutation stays pending', async () => {
    await db.put(PENDING, mutation('m1', 'r1', 1));
    transport.hang.add('r1');
    const controller = new AbortController();
    const upload = manager.uploadPendingMutations({ signal: controller.signal });
    await waitForSend('r1');
    expect((manager as unknown as { uploadInFlight: unknown }).uploadInFlight).not.toBeNull();

    controller.abort();
    await upload;

    expect((manager as unknown as { uploadInFlight: unknown }).uploadInFlight).toBeNull();
    expect(await pendingIds()).toEqual(['m1']);
    const kept = (await db.get(PENDING, 'm1')) as PendingMutation;
    expect(kept.retries).toBe(0);
    expect(await db.getAll(REPLICATION_STORES.FAILED_MUTATIONS)).toEqual([]);
  });

  it('the next upload after an abort sends the still-pending mutations', async () => {
    await db.put(PENDING, mutation('m1', 'r1', 1));
    transport.hang.add('r1');
    const controller = new AbortController();
    const upload = manager.uploadPendingMutations({ signal: controller.signal });
    await waitForSend('r1');
    controller.abort();
    await upload;

    transport.hang.clear();
    transport.sent.length = 0;
    const results = await manager.uploadPendingMutations();

    expect(transport.sent).toEqual(['r1']);
    expect(results).toHaveLength(1);
    expect(results[0]?.success).toBe(true);
    expect(await pendingIds()).toEqual([]);
  });

  it('a call made right after abort() waits for the wind-down and sends fresh', async () => {
    await db.put(PENDING, mutation('m1', 'r1', 1));
    transport.hang.add('r1');
    const controller = new AbortController();
    const first = manager.uploadPendingMutations({ signal: controller.signal });
    await waitForSend('r1');
    controller.abort();
    transport.hang.clear();
    transport.sent.length = 0;
    const second = manager.uploadPendingMutations();
    await first;

    expect(await second).toHaveLength(1);
    expect(transport.sent).toEqual(['r1']);
    expect(await pendingIds()).toEqual([]);
  });

  it('an abort before start is a no-op that leaves the queue intact', async () => {
    await db.put(PENDING, mutation('m1', 'r1', 1));
    const controller = new AbortController();
    controller.abort();

    expect(await manager.uploadPendingMutations({ signal: controller.signal })).toEqual([]);

    expect(transport.sent).toEqual([]);
    expect(await pendingIds()).toEqual(['m1']);
    expect((manager as unknown as { uploadInFlight: unknown }).uploadInFlight).toBeNull();
  });

  it('a mutation confirmed before the abort is not re-sent', async () => {
    await db.put(PENDING, mutation('m1', 'r1', 1));
    await db.put(PENDING, mutation('m2', 'r2', 2));
    transport.hang.add('r2');
    const controller = new AbortController();
    const upload = manager.uploadPendingMutations({ signal: controller.signal });
    await waitForSend('r2');
    controller.abort();
    await upload;
    expect(await pendingIds()).toEqual(['m2']);

    transport.hang.clear();
    transport.sent.length = 0;
    await manager.uploadPendingMutations();

    expect(transport.sent).toEqual(['r2']);
    expect(await pendingIds()).toEqual([]);
  });

  it('sends with a signal on a browser without throwIfAborted or signal.reason', async () => {
    await db.put(PENDING, mutation('m1', 'r1', 1));
    const listeners: Array<() => void> = [];
    const bareSignal = {
      aborted: false,
      addEventListener: (_: string, fn: () => void) => listeners.push(fn),
      removeEventListener: vi.fn(),
    } as unknown as AbortSignal;

    const results = await manager.uploadPendingMutations({ signal: bareSignal });

    expect(transport.sent).toEqual(['r1']);
    expect(results[0]?.success).toBe(true);
    expect(await pendingIds()).toEqual([]);
  });

  describe('abort while waiting for the upload lock', () => {
    type Waiter = { grant: () => void };
    let release: () => void;
    let waiters: Waiter[];

    // A navigator.locks whose lock is held by "another tab" until `release()`.
    function installHeldWebLock() {
      let heldByOtherTab = true;
      waiters = [];
      const request = (_name: string, options: unknown, maybeCallback?: unknown) => {
        const callback = (maybeCallback ?? options) as () => Promise<unknown>;
        const signal = maybeCallback ? (options as { signal?: AbortSignal }).signal : undefined;
        return new Promise((resolve, reject) => {
          const run = () => callback().then(resolve, reject);
          if (!heldByOtherTab) {
            void run();
            return;
          }
          const waiter: Waiter = { grant: () => void run() };
          waiters.push(waiter);
          signal?.addEventListener(
            'abort',
            () => {
              waiters.splice(waiters.indexOf(waiter), 1);
              reject(signal.reason);
            },
            { once: true }
          );
        });
      };
      release = () => {
        heldByOtherTab = false;
        waiters.splice(0).forEach(w => w.grant());
      };
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true, locks: { request } },
        configurable: true,
      });
    }

    it('settles promptly, clears uploadInFlight, and the next upload proceeds once freed', async () => {
      installHeldWebLock();
      await db.put(PENDING, mutation('m1', 'r1', 1));
      const controller = new AbortController();
      const upload = manager.uploadPendingMutations({ signal: controller.signal });
      await vi.waitFor(() => expect(waiters).toHaveLength(1));

      controller.abort();

      expect(await upload).toEqual([]);
      expect((manager as unknown as { uploadInFlight: unknown }).uploadInFlight).toBeNull();
      expect(transport.sent).toEqual([]);

      release();
      const results = await manager.uploadPendingMutations();
      expect(transport.sent).toEqual(['r1']);
      expect(results[0]?.success).toBe(true);
    });
  });
});
