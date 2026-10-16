import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetConflictSurfacingForTests, configureConflictSurfacing } from './conflictConfig';
import type { DirtyRowComparePolicy } from './conflict/detectDirtyRowConflict';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { ReplicatedTable } from './core/ReplicatedTable';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import type { RowRefetchAdapter } from './refetchDirtyRowsById';
import type { PendingMutation, SyncOptions, SyncResult } from './types';

/**
 * MYK9-1220: a judge saves Q (A), then corrects it to NQ (B) before the next
 * pull. A is acknowledged while B is still queued. The pull that returns A's row
 * is the device's OWN write and must not read as someone else changing the row.
 *
 * The fix moves the row's merge base forward when A is acknowledged, so these
 * tests drive the real upload runner for A (B is held in backoff) and the real
 * reconcile for the pull. The remote columns are named differently from the local
 * fields so a hand-mapped shortcut cannot pass.
 */
interface ScoreRow {
  id: string;
  result: string | null;
  reason: string | null;
  placement: number | null;
  endedAt: string | null;
}

interface RemoteScore {
  id: string;
  result_status: string | null;
  reason_text: string | null;
  final_placement: number | null;
  ended_at: string | null;
  version: number;
}

class ScoreTable extends ReplicatedTable<ScoreRow> {
  constructor(
    name: string,
    private readonly policy?: DirtyRowComparePolicy
  ) {
    super(name);
  }

  async sync(_scope: string, _options?: Partial<SyncOptions>): Promise<SyncResult> {
    return {
      tableName: this.getTableName(),
      success: true,
      operation: 'incremental-sync',
      rowsAffected: 0,
      duration: 0,
    };
  }

  protected resolveConflict(_local: ScoreRow, remote: ScoreRow): ScoreRow {
    return remote;
  }

  adapter(): RowRefetchAdapter<RemoteScore, ScoreRow> {
    return this.getRowRefetchAdapter();
  }

  protected override getRowRefetchAdapter(): RowRefetchAdapter<RemoteScore, ScoreRow> {
    return {
      fetchRowsById: async () => [],
      getRemoteId: remote => remote.id,
      toLocalRow: remote => ({
        id: remote.id,
        result: remote.result_status,
        reason: remote.reason_text,
        placement: remote.final_placement,
        endedAt: remote.ended_at,
      }),
      toRemoteRow: local => ({
        id: local.id,
        result_status: local.result,
        reason_text: local.reason,
        final_placement: local.placement,
        ended_at: local.endedAt,
      }),
      rebuildUpdatePayload: local => ({
        id: local.id,
        result_status: local.result,
        reason_text: local.reason,
      }),
      ...(this.policy && { dirtyRowComparePolicy: this.policy }),
    };
  }
}

const AUTH = 'ack-rebase-user';

/** A server that applies direct UPDATEs against `version=eq.<n>` and bumps the version. */
function makeServer() {
  const row: RemoteScore = {
    id: '1',
    result_status: 'abs',
    reason_text: 'R0',
    final_placement: null,
    ended_at: null,
    version: 3,
  };
  const updates: Array<{ data: Record<string, unknown>; expectedVersion: unknown }> = [];
  const from = vi.fn(() => ({
    update: (data: Record<string, unknown>) => {
      const call = { data, expectedVersion: undefined as unknown };
      updates.push(call);
      const builder = {
        eq(column: string, value: unknown) {
          if (column === 'version') call.expectedVersion = value;
          return builder;
        },
        async select() {
          if (call.expectedVersion !== undefined && call.expectedVersion !== row.version) {
            return { data: [], error: null };
          }
          Object.assign(row, data, { version: row.version + 1 });
          return { data: [{ id: '1', version: row.version }], error: null };
        },
      };
      return builder;
    },
  }));
  return { row, updates, supabase: { from } as unknown as SupabaseClient };
}

describe('a pull that returns the device’s own acknowledged write (MYK9-1220)', () => {
  let tableName: string;
  let manager: MutationManager | undefined;
  let conflicts: Array<{ fields: string[] }>;

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
    tableName = `scores_${crypto.randomUUID()}`;
    conflicts = [];
    vi.stubGlobal('window', {
      dispatchEvent: (event: Event) => {
        if (event.type === 'replication:conflict') {
          conflicts.push((event as CustomEvent).detail);
        }
        return true;
      },
    });
  });

  afterEach(async () => {
    manager?.destroy();
    manager = undefined;
    _resetConflictSurfacingForTests();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  function mutation(
    id: string,
    data: Record<string, unknown>,
    serverVersion: number,
    extra: Partial<PendingMutation> = {}
  ): PendingMutation {
    return {
      id,
      authUserId: AUTH,
      tableName,
      operation: 'UPDATE',
      rowId: '1',
      data: { id: '1', ...data },
      explicitDataKeys: ['id', ...Object.keys(data)],
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
      serverVersion,
      ...extra,
    };
  }

  function start(table: ScoreTable) {
    const server = makeServer();
    const logger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    manager = new MutationManager(server.supabase, {
      logger,
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({
        authUserId: AUTH,
        supabaseClient: server.supabase,
      }),
    });
    table.setMutationManager(manager);
    return server;
  }

  /** Clean at v3 (ABS, reason R0), then the device saves Q (A) and queues it. */
  async function seedA(table: ScoreTable) {
    await table.set(
      '1',
      { id: '1', result: 'abs', reason: 'R0', placement: null, endedAt: null },
      false,
      undefined,
      3
    );
    await table.set(
      '1',
      { id: '1', result: 'q', reason: null, placement: null, endedAt: null },
      true
    );
    const db = await databaseManager.getDatabase('test');
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('mut-A', { result_status: 'q', reason_text: null }, 3)
    );
  }

  /** B is saved while A is unacknowledged. It is held in backoff so only A uploads. */
  async function queueB(table: ScoreTable, local: Partial<ScoreRow>) {
    const row = (await table.getReplicatedRow('1'))!.data;
    await table.set('1', { ...row, ...local }, true);
    const db = await databaseManager.getDatabase('test');
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation(
        'mut-B',
        { result_status: local.result ?? row.result, reason_text: local.reason ?? row.reason },
        3,
        { nextRetryAt: Date.now() + 3_600_000 }
      )
    );
  }

  async function ackA() {
    await manager!.uploadPendingMutations();
    await vi.waitFor(async () => {
      const db = await databaseManager.getDatabase('test');
      expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-A')).toBeUndefined();
    });
  }

  async function pull(table: ScoreTable, remote: RemoteScore) {
    const existing = (await table.getReplicatedRow('1'))!;
    const adapter = table.adapter();
    return reconcileDirtyRemoteRow(table, adapter, {
      id: '1',
      existing: { ...existing, baseData: existing.baseData! },
      remoteLocal: adapter.toLocalRow(remote),
      remoteServerVersion: remote.version,
    });
  }

  const ownWrite = (extra: Partial<RemoteScore> = {}): RemoteScore => ({
    id: '1',
    result_status: 'q',
    reason_text: null,
    final_placement: null,
    ended_at: null,
    version: 4,
    ...extra,
  });

  it('(i) A is acknowledged while B is queued: pulling A is no conflict, B keeps its edit', async () => {
    const table = new ScoreTable(tableName);
    const server = start(table);
    await seedA(table);
    await queueB(table, { result: 'nq', reason: 'R1' });
    await ackA();
    expect(server.updates).toHaveLength(1);

    const outcome = await pull(table, ownWrite());

    expect(conflicts).toEqual([]);
    expect(outcome.conflict).toBe(false);
    const row = await table.getReplicatedRow('1');
    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.data).toMatchObject({ result: 'nq', reason: 'R1' });
    expect(row?.serverVersion).toBe(4);
    expect(row?.isDirty).toBe(true);
    const db = await databaseManager.getDatabase('test');
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-B')).toBeDefined();
  });

  it('(i-b) B is saved after A is acknowledged: pulling A is no conflict', async () => {
    const table = new ScoreTable(tableName);
    start(table);
    await seedA(table);
    // A stays "pending" for B's sake only until B exists; ack with B queued first
    // is (i), here the row is clean after the ack and B is a fresh dirty write.
    await ackA();
    const clean = await table.getReplicatedRow('1');
    expect(clean?.isDirty).toBe(false);
    await queueB(table, { result: 'nq', reason: 'R1' });

    const outcome = await pull(table, ownWrite());

    expect(outcome.conflict).toBe(false);
    expect(conflicts).toEqual([]);
  });

  it('(ii) the pull lands while A is still in flight and returns the pre-A row', async () => {
    const table = new ScoreTable(tableName);
    start(table);
    await seedA(table);
    await queueB(table, { result: 'nq', reason: 'R1' });

    const outcome = await pull(
      table,
      ownWrite({ result_status: 'abs', reason_text: 'R0', version: 3 })
    );

    expect(outcome.conflict).toBe(false);
    expect(conflicts).toEqual([]);
  });

  it('(iii) control: another device wrote a different result and reason at v5, so it IS a conflict', async () => {
    const table = new ScoreTable(tableName);
    start(table);
    await seedA(table);
    await queueB(table, { result: 'nq', reason: 'R1' });
    await ackA();

    const outcome = await pull(
      table,
      ownWrite({ result_status: 'excused', reason_text: 'R2', version: 5 })
    );

    expect(outcome.conflict).toBe(true);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fields.sort()).toEqual(['reason', 'result']);
  });

  it('(iv) A’s acked row carries a server-generated placement: it is adopted, B keeps its fields, the base moves to v4', async () => {
    const table = new ScoreTable(tableName);
    start(table);
    await seedA(table);
    await queueB(table, { result: 'nq', reason: 'R1' });
    await ackA();

    const remote = ownWrite({ final_placement: 1 });
    const outcome = await pull(table, remote);

    expect(conflicts).toEqual([]);
    expect(outcome.conflict).toBe(false);
    const row = await table.getReplicatedRow('1');
    expect(row?.data).toMatchObject({ result: 'nq', reason: 'R1', placement: 1 });
    expect(row?.baseData).toEqual(table.adapter().toLocalRow(remote));
    expect(row?.serverVersion).toBe(4);
  });

  it('P1: a correction that restores a pre-save value keeps it (base ABS/R0, A = Q/null, B = NQ/R0)', async () => {
    const table = new ScoreTable(tableName);
    start(table);
    await seedA(table);
    await queueB(table, { result: 'nq', reason: 'R0' });
    await ackA();

    const outcome = await pull(table, ownWrite());

    expect(conflicts).toEqual([]);
    expect(outcome.conflict).toBe(false);
    const row = await table.getReplicatedRow('1');
    expect(row?.data).toMatchObject({ result: 'nq', reason: 'R0' });
    expect(row?.isDirty).toBe(true);
    const db = await databaseManager.getDatabase('test');
    expect(await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-B')).toBeDefined();
  });

  describe('P2: the class compare policy still applies to a later edit', () => {
    // The class policy: Completed/completed agree, and the server's completion
    // stamp wins once the status agrees (CLASS_DIRTY_ROW_COMPARE_POLICY).
    const policy: DirtyRowComparePolicy = {
      normalizeValue: (field, value) =>
        field === 'result' && typeof value === 'string' ? value.toLowerCase() : value,
      serverWinsFields: ['endedAt'],
    };

    it('adopts the server’s completion stamp when A (Completed + device stamp) is acked and B is queued', async () => {
      const table = new ScoreTable(tableName, policy);
      start(table);
      await table.set(
        '1',
        { id: '1', result: 'abs', reason: 'R0', placement: null, endedAt: null },
        false,
        undefined,
        3
      );
      await table.set(
        '1',
        { id: '1', result: 'Done', reason: 'R0', placement: null, endedAt: 'device-stamp' },
        true
      );
      const db = await databaseManager.getDatabase('test');
      await db.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        mutation('mut-A', { result_status: 'Done', ended_at: 'device-stamp' }, 3)
      );
      await queueB(table, { reason: 'R1' });
      await ackA();

      // The server spells the status its own way and stamps its own completion time.
      const outcome = await pull(
        table,
        ownWrite({ result_status: 'done', reason_text: 'R0', ended_at: 'server-stamp' })
      );

      expect(conflicts).toEqual([]);
      expect(outcome.conflict).toBe(false);
      const row = await table.getReplicatedRow('1');
      expect(row?.data).toMatchObject({ reason: 'R1', endedAt: 'server-stamp' });
      expect(row?.serverVersion).toBe(4);
    });
  });
});
