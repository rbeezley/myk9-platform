import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { MutationManager } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import type { PendingMutation } from './types';

const AUTH_USER_ID = 'rpc-occ-user';

function createLogger(): Logger {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

/**
 * MYK9-2111. A paper save whose RPC write goes out on a stale token (the
 * server already moved the row to version 2) is rejected with 40001 carrying
 * the current version. The queued write must be re-stamped with that version,
 * so its retry goes out on version 2 and drains, instead of re-sending the
 * stale token on every backoff until the lifetime cap parks it.
 */
describe('MutationManager: an RPC write rejected on a stale OCC token', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    db = await createMutationManagerTestDb(`rpc-occ-rebase-${crypto.randomUUID()}`);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { dispatchEvent: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    rpc = vi.fn((_name: string, args: { p_expected_version: number }) =>
      Promise.resolve(
        args.p_expected_version === 2
          ? { data: 3, error: null }
          : { data: null, error: { code: '40001', message: 'version conflict', details: '2' } }
      )
    );
    const supabase = { rpc, from: vi.fn() } as unknown as SupabaseClient;
    manager = new MutationManager(supabase, {
      logger: createLogger(),
      retryBackoffBase: 10,
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
    const mutation: PendingMutation = {
      id: 'mut-paper-save',
      authUserId: AUTH_USER_ID,
      tableName: 'entries',
      operation: 'UPDATE',
      rowId: 'entry-1',
      data: { id: 'entry-1', is_scored: true },
      timestamp: Date.now(),
      sequenceNumber: 1,
      retries: 0,
      status: 'pending',
      serverVersion: 1,
      rpc: { name: 'ringside_update_entry', fields: { is_scored: true } },
    };
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, mutation);
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
  });

  it('re-stamps the queued write with the version the server reported', async () => {
    await manager.uploadPendingMutations();

    expect(rpc).toHaveBeenCalledTimes(1);
    const queued = (await db.get(
      REPLICATION_STORES.PENDING_MUTATIONS,
      'mut-paper-save'
    )) as PendingMutation;
    expect(queued.serverVersion).toBe(2);
  });

  it('drains on its backoff retry, sending the reported version', async () => {
    await manager.uploadPendingMutations();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2), { timeout: 3000 });

    expect(rpc.mock.calls[1]![1]).toMatchObject({ p_expected_version: 2 });
    await vi.waitFor(async () =>
      expect(await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0)
    );
  });
});
