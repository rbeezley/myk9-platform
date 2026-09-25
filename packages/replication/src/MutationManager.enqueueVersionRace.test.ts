import { createClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import type { PendingMutation } from './types';

const AUTH_USER_ID = 'enqueue-race-user';

function createLogger(): Logger {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

/**
 * MYK9-770. A secretary assigns an armband and, while that write is in
 * flight, presses Accept. ReplicatedTable reads the row's OCC token (version 1)
 * for the Accept, then the armband upload lands: it marks the row version 2 and
 * re-stamps the row's QUEUED mutations to 2 — but the Accept is not in the
 * queue yet. The Accept is then queued carrying the stale version 1, every
 * upload of it matches 0 rows (`version=eq.1`), and a full-row UPDATE is never
 * rebased: it retried forever while the page read "Accepted" (Regression run
 * 36156361241). Queuing must stamp the token the row holds at that moment.
 */
describe('MutationManager queueMutation — OCC token read at enqueue', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;

  beforeEach(async () => {
    db = await createMutationManagerTestDb(`enqueue-version-race-${crypto.randomUUID()}`);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn() },
      configurable: true,
    });
    const supabase = createClient('https://example.supabase.co', 'test-anon-key', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    manager = new MutationManager(supabase, {
      logger: createLogger(),
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({ authUserId: AUTH_USER_ID, supabaseClient: supabase }),
    });
  });

  afterEach(() => {
    manager?.destroy();
    db?.close();
    vi.restoreAllMocks();
  });

  async function putRow(serverVersion: number | undefined) {
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
      tableName: 'entries',
      id: 'entry-1',
      data: { id: 'entry-1', entry_status: 'confirmed' },
      isDirty: true,
      ...(serverVersion !== undefined && { serverVersion }),
    });
  }

  async function queueAccept(serverVersion: number | undefined): Promise<PendingMutation> {
    const id = await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1', entry_status: 'confirmed' },
      undefined,
      serverVersion,
      undefined,
      false
    );
    return (await db.get(REPLICATION_STORES.PENDING_MUTATIONS, id)) as PendingMutation;
  }

  it('carries the version the row holds when it is queued, not the stale one read earlier', async () => {
    // The armband upload already landed: row is at 2, the queue re-stamp is done.
    await putRow(2);
    const accept = await queueAccept(1);
    expect(accept.serverVersion).toBe(2);
  });

  it('never lowers the version the caller passed', async () => {
    await putRow(1);
    const accept = await queueAccept(3);
    expect(accept.serverVersion).toBe(3);
  });

  it('adds no precondition when the caller passed none (conflict surfacing off)', async () => {
    await putRow(2);
    const accept = await queueAccept(undefined);
    expect(accept.serverVersion).toBeUndefined();
  });

  it('keeps the caller version when the row is not cached', async () => {
    const accept = await queueAccept(4);
    expect(accept.serverVersion).toBe(4);
  });
});
