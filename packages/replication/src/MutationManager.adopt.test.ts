import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDBPDatabase } from 'idb';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MutationManager } from './MutationManager';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { createMutationManagerTestDb } from './test-utils/createMutationManagerTestDb';
import type { PendingMutation } from './types';

/**
 * MYK9-1205: queue entries are stamped (anonymous owner, show) at enqueue, and
 * adoption only ever runs for the live session.
 */
const RPCS = ['ringside_update_entry'] as const;
const SCORE_RPC = { name: 'ringside_update_entry', fields: { result_status: 'qualified' } };

describe('MutationManager adoption (MYK9-1205)', () => {
  let db: IDBPDatabase;
  let manager: MutationManager;
  let user = 'anon-1';
  const anonymous = new Set<string>(['anon-1', 'anon-2']);

  const queue = (rowId: string, showId?: string) =>
    manager.queueMutation(
      'entries',
      'UPDATE',
      rowId,
      { id: rowId },
      undefined,
      undefined,
      SCORE_RPC,
      false,
      undefined,
      showId
    );
  const pending = async () =>
    (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];

  beforeEach(async () => {
    db = await createMutationManagerTestDb('test-mutation-manager-adopt-db');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    vi.spyOn(databaseManager, 'getDatabase').mockResolvedValue(db);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: false },
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { dispatchEvent: vi.fn() },
    });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: { getItem: vi.fn().mockReturnValue(null), setItem: vi.fn(), removeItem: vi.fn() },
    });
    user = 'anon-1';
    manager = new MutationManager({ rpc: vi.fn() } as unknown as SupabaseClient, {
      getCurrentUserId: async () => user,
      getOwnerIsAnonymous: id => anonymous.has(id),
      getCurrentUploadContext: async () => ({
        authUserId: user,
        supabaseClient: { rpc: vi.fn() } as unknown as SupabaseClient,
      }),
    });
  });

  afterEach(() => {
    manager.destroy();
    db.close();
    vi.restoreAllMocks();
  });

  it('stamps the anonymous owner and show on a new entry, and nothing for a signed-in owner', async () => {
    await queue('e1', 'show-x');
    user = 'judge-1';
    await queue('e2', 'show-x');
    user = 'anon-1';
    await queue('e3');

    const rows = Object.fromEntries((await pending()).map(row => [row.rowId, row]));
    expect(rows.e1).toMatchObject({ ownerIsAnonymous: true, showId: 'show-x' });
    expect(rows.e2).not.toHaveProperty('ownerIsAnonymous');
    expect(rows.e3).not.toHaveProperty('showId');
  });

  it('refuses to adopt for anyone but the live session', async () => {
    await queue('e1', 'show-x');
    user = 'anon-2';

    await expect(
      manager.adoptHeldMutations({ showId: 'show-x', toAuthUserId: 'anon-3', rpcNames: RPCS })
    ).rejects.toThrow(/user changed/);
    expect((await pending()).map(row => row.authUserId)).toEqual(['anon-1']);

    await expect(
      manager.adoptHeldMutations({ showId: 'show-x', toAuthUserId: 'anon-2', rpcNames: RPCS })
    ).resolves.toBe(1);
    expect((await pending()).map(row => row.authUserId)).toEqual(['anon-2']);
  });

  it('re-checks the live session INSIDE the upload lock, so a switch while waiting refuses', async () => {
    await queue('e1', 'show-x');
    user = 'anon-2';
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const runner = (
      manager as unknown as {
        uploadRunner: { runExclusive(w: () => Promise<void>): Promise<void> };
      }
    ).uploadRunner;
    const held = runner.runExclusive(() => gate);

    const adopting = manager.adoptHeldMutations({
      showId: 'show-x',
      toAuthUserId: 'anon-2',
      rpcNames: RPCS,
    });
    const refused = expect(adopting).rejects.toThrow(/user changed/);
    // The pre-lock check has passed (still anon-2); now the session changes.
    await new Promise(resolve => setTimeout(resolve, 10));
    user = 'anon-3';
    release();
    await held;
    await refused;

    expect((await pending()).map(row => row.authUserId)).toEqual(['anon-1']);
  });

  it('survives a localStorage backup failure: adopted, event fired, upload scheduled', async () => {
    await queue('e1', 'show-x');
    user = 'anon-2';
    const internals = manager as unknown as {
      backupStore: { writeCurrent(): Promise<void> };
      scheduleUpload(): void;
    };
    vi.spyOn(internals.backupStore, 'writeCurrent').mockRejectedValue(new Error('QuotaExceeded'));
    const schedule = vi.spyOn(internals, 'scheduleUpload').mockImplementation(() => {});
    const dispatch = vi.mocked(window.dispatchEvent);
    dispatch.mockClear();

    await expect(
      manager.adoptHeldMutations({ showId: 'show-x', toAuthUserId: 'anon-2', rpcNames: RPCS })
    ).resolves.toBe(1);

    expect((await pending()).map(row => row.authUserId)).toEqual(['anon-2']);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'replication:mutation-queued' })
    );
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
