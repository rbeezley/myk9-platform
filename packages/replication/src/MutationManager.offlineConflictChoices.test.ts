import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { _resetConflictSurfacingForTests, configureConflictSurfacing } from './conflictConfig';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { ReplicatedTable } from './core/ReplicatedTable';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import type { PendingMutation, ReplicatedRow, SyncResult } from './types';

/**
 * MYK9-2337: the same collision, answered OFFLINE past JWT expiry. The live session lookup
 * throws; the persisted account still names the queue owner. Both choices must resolve, and a
 * failed reconcile must leave the conflict snapshot in IndexedDB so the person can choose again.
 */
interface ClassRow {
  id: string;
  classStatus: string;
}

const USER = 'judge-passcode-session';
const CLASS_RPC = 'ringside_update_class';

class ClassesTable extends ReplicatedTable<ClassRow> {
  // As ReplicatedClassesTable: Discard of a refused write puts the row back to the server's copy.
  protected override readonly revertsOnDiscard = true;
  async sync(): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }
  protected resolveConflict(_local: ClassRow, remote: ClassRow): ClassRow {
    return remote;
  }
  /** The ringside status write: an RPC delta, like ReplicatedClassesTable.updateClass. */
  async setStatus(id: string, classStatus: string): Promise<void> {
    await this.writeAndQueue(
      id,
      { id, classStatus },
      {
        operation: 'UPDATE',
        payload: { status: classStatus },
        rpc: { name: CLASS_RPC, idParam: 'p_class_id', fields: { status: classStatus } },
      }
    );
  }
}

interface ServerClass {
  status: string;
  version: number;
}

/** ringside_update_class's OCC: a stale p_expected_version raises 40001 with the version in DETAIL. */
function makeServer(row: ServerClass) {
  const state = { refuse: null as null | { code: string; message: string } };
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    if (state.refuse) return { data: null, error: state.refuse, status: 403 };
    if (args.p_expected_version !== null && args.p_expected_version !== row.version) {
      return {
        data: null,
        error: { code: '40001', message: 'Version conflict', details: String(row.version) },
        status: 409,
      };
    }
    row.status = (args.p_fields as { status: string }).status;
    row.version += 1;
    return { data: row.version, error: null, status: 200 };
  });
  return { supabase: { rpc } as unknown as SupabaseClient, rpc, state };
}

describe('conflict choices offline past session expiry (MYK9-2337)', () => {
  let manager: MutationManager;
  let table: ClassesTable;
  let expired = false;

  const deviceRow = async () => (await table.getReplicatedRow('c1')) as ReplicatedRow<ClassRow>;
  const queued = async () => {
    const db = await databaseManager.getDatabase('test');
    return ((await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[]).filter(
      m => m.tableName === table.getTableName()
    );
  };

  beforeEach(async () => {
    expired = false;
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    Object.defineProperty(globalThis, 'localStorage', {
      value: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
      configurable: true,
    });
    vi.stubGlobal('window', { dispatchEvent: () => true });

    const server = { status: 'upcoming', version: 4 };
    const fake = makeServer(server);
    const logger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    manager = new MutationManager(fake.supabase, {
      logger,
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => {
        if (expired) throw new Error('AuthRetryableFetchError');
        return USER;
      },
      getCachedUserId: () => USER,
      getCurrentUploadContext: async () => ({ authUserId: USER, supabaseClient: fake.supabase }),
    });
    table = new ClassesTable(`classes_${crypto.randomUUID()}`);
    table.setMutationManager(manager);

    await table.set('c1', { id: 'c1', classStatus: 'upcoming' }, false, undefined, 4);
    await table.setStatus('c1', 'in_progress');
    server.status = 'cancelled';
    server.version = 5;
    await manager.uploadPendingMutations();
    const existing = (await deviceRow()) as ReplicatedRow<ClassRow> & { baseData: ClassRow };
    const outcome = await reconcileDirtyRemoteRow(
      table,
      {},
      {
        id: 'c1',
        existing,
        remoteLocal: { id: 'c1', classStatus: 'cancelled' },
        remoteServerVersion: 5,
      }
    );
    expect(outcome.conflict).toBe(true);
    fake.rpc.mockClear();

    // The phone is now offline and the session token has expired.
    expired = true;
    vi.stubGlobal('navigator', { onLine: false });
  });

  afterEach(async () => {
    manager.destroy();
    _resetConflictSurfacingForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it('Keep my change: clears the conflict and moves the queued write to the server version', async () => {
    expect(await table.resolveReplicationConflict('c1', 'keep-local')).toBe(true);

    const row = await deviceRow();
    expect(row.syncStatus).toBe('pending');
    expect(row.conflict).toBeUndefined();
    const [write] = await queued();
    expect(write?.serverVersion).toBe(5);
    // Sending stays gated on a live session: offline it only clears the retry wait.
    expect(await manager.sendRowNow(table.getTableName(), 'c1')).toEqual([]);
  });

  it('Keep the other change: discards the queued write and shows the server copy', async () => {
    await manager.discardPendingMutationsForRow(table.getTableName(), 'c1');
    expect(await table.resolveReplicationConflict('c1', 'take-remote')).toBe(true);

    expect(await queued()).toEqual([]);
    const row = await deviceRow();
    expect(row.data.classStatus).toBe('cancelled');
    expect(row.syncStatus).not.toBe('conflict');
  });

  it('queue reads answer offline from the persisted account', async () => {
    expect(await manager.getPendingMutationsForRow(table.getTableName(), 'c1')).toHaveLength(1);
    expect(await manager.getFailedMutations()).toEqual([]);
  });

  it('a failed reconcile leaves the conflict snapshot and the queued write untouched', async () => {
    const before = (await queued())[0];
    vi.spyOn(manager, 'reconcilePendingMutationsForRow').mockRejectedValueOnce(
      new Error('queue unavailable')
    );

    await expect(table.resolveReplicationConflict('c1', 'keep-local')).rejects.toThrow(
      'queue unavailable'
    );

    const row = await deviceRow();
    expect(row.syncStatus).toBe('conflict');
    expect(row.conflict).toBeDefined();
    expect((await queued())[0]).toEqual(before);

    // The person can choose again, and it now succeeds.
    expect(await table.resolveReplicationConflict('c1', 'keep-local')).toBe(true);
    expect((await deviceRow()).conflict).toBeUndefined();
  });

  it('a local edit saved during the reconcile keeps the conflict and the newer edit (Codex P1 on #4324)', async () => {
    const original = manager.reconcilePendingMutationsForRow.bind(manager);
    vi.spyOn(manager, 'reconcilePendingMutationsForRow').mockImplementationOnce(async (...args) => {
      // The judge taps another status while "Keep my change" is still sorting out the queue.
      await table.setStatus('c1', 'completed');
      return original(...args);
    });

    await expect(table.resolveReplicationConflict('c1', 'keep-local')).rejects.toThrow(
      'changed while its conflict was being resolved'
    );

    const row = await deviceRow();
    expect(row.data.classStatus).toBe('completed');
    expect(row.syncStatus).toBe('conflict');
    expect(row.conflict).toBeDefined();
  });
});
