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

  async function putRow(
    serverVersion: number | undefined,
    lastOwnUpload?: { from: number; to: number }
  ) {
    await db.put(REPLICATION_STORES.REPLICATED_TABLES, {
      tableName: 'entries',
      id: 'entry-1',
      data: { id: 'entry-1', entry_status: 'confirmed' },
      isDirty: true,
      ...(serverVersion !== undefined && { serverVersion }),
      ...(lastOwnUpload && { lastOwnUpload }),
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

  it("moves past this device's own upload that landed while it was being queued", async () => {
    // The armband upload moved the row 1 -> 2 and its queue re-stamp is done.
    await putRow(2, { from: 1, to: 2 });
    const accept = await queueAccept(1);
    expect(accept.serverVersion).toBe(2);
  });

  it("keeps the stale token when ANOTHER device's write advanced the row (Codex P1)", async () => {
    // A download moved the row to 2; the payload was built on 1, so the
    // precondition must still be 1 and the upload must surface a conflict.
    await putRow(2);
    const accept = await queueAccept(1);
    expect(accept.serverVersion).toBe(1);
  });

  it('keeps the stale token when the row moved on again after the own upload', async () => {
    await putRow(3, { from: 1, to: 2 });
    const accept = await queueAccept(1);
    expect(accept.serverVersion).toBe(1);
  });

  it('never touches a token other than the step it read from', async () => {
    await putRow(2, { from: 1, to: 2 });
    const accept = await queueAccept(2);
    expect(accept.serverVersion).toBe(2);
  });

  it('adds no precondition when the caller passed none (conflict surfacing off)', async () => {
    await putRow(2, { from: 1, to: 2 });
    const accept = await queueAccept(undefined);
    expect(accept.serverVersion).toBeUndefined();
  });

  it('keeps the caller version when the row is not cached', async () => {
    const accept = await queueAccept(4);
    expect(accept.serverVersion).toBe(4);
  });
});
