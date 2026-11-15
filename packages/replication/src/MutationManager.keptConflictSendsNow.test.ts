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
 * MYK9-1993 on the real queue: the judge sets a class to In progress offline, the secretary
 * cancels it, the phone comes back and is asked which change to keep. Each choice must leave
 * the server row and the phone's row the same, at once, with nothing left queued.
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

describe('a kept class-status change is sent at once (MYK9-1993)', () => {
  let manager: MutationManager;
  let table: ClassesTable;
  let server: ServerClass;
  let fake: ReturnType<typeof makeServer>;

  const deviceRow = async () => (await table.getReplicatedRow('c1')) as ReplicatedRow<ClassRow>;
  const queued = async () => {
    const db = await databaseManager.getDatabase('test');
    return ((await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[]).filter(
      m => m.tableName === table.getTableName()
    );
  };

  beforeEach(async () => {
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

    server = { status: 'upcoming', version: 4 };
    fake = makeServer(server);
    const logger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    manager = new MutationManager(fake.supabase, {
      logger,
      // The OCC back-off after the rejection is the 30 s cap, so only an explicit send uploads.
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => USER,
      getCurrentUploadContext: async () => ({ authUserId: USER, supabaseClient: fake.supabase }),
    });
    table = new ClassesTable(`classes_${crypto.randomUUID()}`);
    table.setMutationManager(manager);

    // Synced at version 4; then, offline, the judge sets In progress.
    await table.set('c1', { id: 'c1', classStatus: 'upcoming' }, false, undefined, 4);
    await table.setStatus('c1', 'in_progress');
    // The secretary cancels the class on the laptop.
    server.status = 'cancelled';
    server.version = 5;
    // Back online: the queued write is refused as stale, and the next pull finds the collision.
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
  });

  afterEach(async () => {
    manager.destroy();
    _resetConflictSurfacingForTests();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it('holds the write while the choice is open', async () => {
    await manager.uploadPendingMutations();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect((await deviceRow()).syncStatus).toBe('conflict');
  });

  it('Keep my change: sends the kept status now, and both rows read In progress', async () => {
    expect(await table.resolveReplicationConflict('c1', 'keep-local')).toBe(true);
    // Root cause: the rejection that found the conflict left a retry wait on the write,
    // and nothing asks for an upload, so it waited for the next poll (3 to 5 minutes).
    await manager.uploadPendingMutations();
    expect(fake.rpc).not.toHaveBeenCalled();

    await manager.sendRowNow(table.getTableName(), 'c1');

    expect(fake.rpc).toHaveBeenCalledWith(CLASS_RPC, {
      p_class_id: 'c1',
      p_fields: { status: 'in_progress' },
      p_expected_version: 5,
    });
    expect(server).toEqual({ status: 'in_progress', version: 6 });
    const row = await deviceRow();
    expect(row.data.classStatus).toBe(server.status);
    expect(row.isDirty).toBe(false);
    expect(row.serverVersion).toBe(server.version);
    expect(await queued()).toEqual([]);
  });

  it('Keep the other change: the phone shows Cancelled and nothing stays queued', async () => {
    await manager.discardPendingMutationsForRow(table.getTableName(), 'c1');
    expect(await table.resolveReplicationConflict('c1', 'take-remote')).toBe(true);
    await manager.uploadPendingMutations();

    expect(fake.rpc).not.toHaveBeenCalled();
    expect(server).toEqual({ status: 'cancelled', version: 5 });
    const row = await deviceRow();
    expect(row.data.classStatus).toBe(server.status);
    expect(row.isDirty).toBe(false);
    expect(await queued()).toEqual([]);
  });

  it('a refused kept change, once discarded, leaves the phone on the server status', async () => {
    fake.state.refuse = { code: '42501', message: 'Not authorized to update class c1' };
    await table.resolveReplicationConflict('c1', 'keep-local');

    await manager.sendRowNow(table.getTableName(), 'c1');

    expect(fake.rpc).toHaveBeenCalledTimes(1);
    const failed = (await manager.getFailedMutations()).filter(m => m.rowId === 'c1');
    expect(failed).toHaveLength(1);
    await manager.discardFailedMutation(failed[0]!.id);

    expect(server).toEqual({ status: 'cancelled', version: 5 });
    const row = await deviceRow();
    expect(row.data.classStatus).toBe(server.status);
    expect(row.isDirty).toBe(false);
    expect(await queued()).toEqual([]);
    expect(await manager.getFailedMutations()).toEqual([]);
  });

  it('offline, a kept change waits for the connection instead of failing', async () => {
    await table.resolveReplicationConflict('c1', 'keep-local');
    vi.stubGlobal('navigator', { onLine: false });

    expect(await manager.sendRowNow(table.getTableName(), 'c1')).toEqual([]);

    expect(fake.rpc).not.toHaveBeenCalled();
    const [write] = await queued();
    expect(write?.nextRetryAt).toBeUndefined();
    expect(write?.serverVersion).toBe(5);
  });
});

describe('discardRestoresServerCopy (MYK9-1993)', () => {
  it('reports whether the table puts a discarded row back to the server copy', () => {
    class Plain extends ReplicatedTable<ClassRow> {
      async sync(): Promise<SyncResult> {
        return {
          tableName: 'x',
          success: true,
          operation: 'incremental-sync',
          rowsAffected: 0,
          duration: 0,
        };
      }
      protected resolveConflict(_local: ClassRow, remote: ClassRow): ClassRow {
        return remote;
      }
    }
    expect(new ClassesTable('classes_flag').discardRestoresServerCopy()).toBe(true);
    expect(new Plain('plain_flag').discardRestoresServerCopy()).toBe(false);
  });
});
