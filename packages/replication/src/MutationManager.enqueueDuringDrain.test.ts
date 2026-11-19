import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const AUTH_USER_ID = 'drain-user';
const RPC = { name: 'ringside_update_entry', fields: { is_scored: true } };

function createLogger(): Logger {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

/**
 * MYK9-2111. A write queued while a drain is mid-request (the paper save lands
 * a second write to the row whose first write is still in flight) must be
 * picked up by that drain's follow-up, and must go out on the version the first
 * write produced, never the stale one it was read with.
 */
describe('MutationManager: a write queued while a drain is in flight', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;
  let releaseFirst: (version: number) => void;
  let rpc: ReturnType<typeof vi.fn>;
  let nextVersion: number;

  beforeEach(async () => {
    db = await createMutationManagerTestDb(`enqueue-during-drain-${crypto.randomUUID()}`);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
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
    nextVersion = 2;
    let calls = 0;
    rpc = vi.fn(() => {
      calls += 1;
      if (calls === 1) {
        return new Promise(resolve => {
          releaseFirst = version => resolve({ data: version, error: null });
        });
      }
      return Promise.resolve({ data: nextVersion++, error: null });
    });
    const supabase = { rpc, from: vi.fn() } as unknown as SupabaseClient;
    manager = new MutationManager(supabase, {
      logger: createLogger(),
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({ authUserId: AUTH_USER_ID, supabaseClient: supabase }),
    });
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
      tableName: 'entries',
      id: 'entry-1',
      data: { id: 'entry-1' },
      isDirty: true,
      serverVersion: 1,
    });
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
  });

  /** A minimal exclusive FIFO Web Locks, which real browsers have and jsdom lacks. */
  function installWebLocks(): void {
    let tail: Promise<unknown> = Promise.resolve();
    const locks = {
      request: <R>(_name: string, cb: () => Promise<R>): Promise<R> => {
        const run = tail.then(cb, cb);
        tail = run.catch(() => undefined);
        return run;
      },
    };
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true, locks },
      configurable: true,
    });
  }

  it.each([
    ['in-tab mutex', false],
    ['Web Locks', true],
  ])("drains the second write on the first write's version (%s)", async (_label, webLocks) => {
    if (webLocks) installWebLocks();
    await drainSecondWrite();
  });

  async function drainSecondWrite() {
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1' },
      undefined,
      1,
      RPC
    );
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));

    // The second write is read at version 1 while the first is still in flight.
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1' },
      undefined,
      1,
      RPC
    );
    await new Promise(resolve => setTimeout(resolve, 250));
    releaseFirst(2);

    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2), { timeout: 3000 });
    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_expected_version: 2 });
    await vi.waitFor(async () =>
      expect(await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0)
    );
  }
});
