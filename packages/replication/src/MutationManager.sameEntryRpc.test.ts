import type { SupabaseClient } from '@supabase/supabase-js';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';

const AUTH_USER_ID = 'same-entry-rpc-user';
const RPC = 'ringside_update_entry';

function createLogger(): Logger {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

/**
 * MYK9-1940. Two changes to one entry (run order, then check-in), queued before either
 * uploads (a secretary offline at the desk), both go out through `ringside_update_entry`.
 * Each must reach the server, in the order it was made, carrying only its own field, so
 * neither overwrites the other.
 */
describe('MutationManager: two ringside_update_entry writes for one entry', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;
  let supabase: SupabaseClient;

  beforeEach(async () => {
    db = await createMutationManagerTestDb(`same-entry-rpc-${crypto.randomUUID()}`, {
      includeSyncMetadata: true,
    });
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
    const rpc = vi.fn();
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    rpc.mockResolvedValueOnce({ data: 3, error: null });
    supabase = { rpc } as never;
    manager = new MutationManager(supabase, {
      logger: createLogger(),
      getCurrentUserId: async () => AUTH_USER_ID,
      getCurrentUploadContext: async () => ({ authUserId: AUTH_USER_ID, supabaseClient: supabase }),
    });
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
  });

  it('uploads both, in order, each with only its own field', async () => {
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1' },
      undefined,
      1,
      { name: RPC, fields: { run_order: 7 } },
      false
    );
    await manager.queueMutation(
      'entries',
      'UPDATE',
      'entry-1',
      { id: 'entry-1' },
      undefined,
      1,
      { name: RPC, fields: { check_in_status: 'checked-in' } },
      false
    );

    await manager.uploadPendingMutations();

    const calls = vi.mocked(supabase.rpc).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      RPC,
      expect.objectContaining({ p_entry_id: 'entry-1', p_fields: { run_order: 7 } }),
    ]);
    expect(calls[1]).toEqual([
      RPC,
      expect.objectContaining({
        p_entry_id: 'entry-1',
        p_fields: { check_in_status: 'checked-in' },
      }),
    ]);
    expect(calls[0]?.[1]).toEqual(expect.objectContaining({ p_expected_version: 1 }));
    expect(calls[1]?.[1]).toEqual(expect.objectContaining({ p_expected_version: 2 }));
    expect(await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)).toHaveLength(0);
  });
});
