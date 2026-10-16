import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetConflictSurfacingForTests, configureConflictSurfacing } from './conflictConfig';
import type { DirtyRowComparePolicy } from './conflict/detectDirtyRowConflict';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import { AUTH, makeServer, ScoreTable, type RemoteScore } from './test-utils/ackRebaseFixtures';
import type { PendingMutation } from './types';

/**
 * MYK9-1221: the server commits A, but A's acknowledgement is not processed yet
 * when a sync pull returns A's row. B is queued, so the row is dirty and its base
 * is still the pre-A row. A write of this device that is IN FLIGHT counts as part
 * of the base, so the pull reads A as the device's own write.
 *
 * These drive the real upload runner for A (its response is held by the fake
 * server after it commits) and the real reconcile for the pull.
 */
describe('a pull that lands before the device processes its own acknowledgement (MYK9-1221)', () => {
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
    const server = makeServer({ holdFirstAck: true });
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

  /** Clean at v3, the device saves `a` and queues A; B follows, held in backoff. */
  async function seed(table: ScoreTable, a: Record<string, unknown>, b: Record<string, unknown>) {
    await table.set(
      '1',
      { id: '1', result: 'abs', reason: 'R0', placement: null, endedAt: null },
      false,
      undefined,
      3
    );
    const db = await databaseManager.getDatabase('test');
    const afterA = { id: '1', result: 'q', reason: null, placement: null, endedAt: null, ...a };
    await table.set('1', afterA, true);
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('mut-A', { result_status: afterA.result, reason_text: afterA.reason }, 3)
    );
    const afterB = { ...afterA, ...b };
    await table.set('1', afterB, true);
    await db.put(
      REPLICATION_STORES.PENDING_MUTATIONS,
      mutation('mut-B', { result_status: afterB.result, reason_text: afterB.reason }, 3, {
        nextRetryAt: Date.now() + 3_600_000,
      })
    );
  }

  /** Send A; resolves once the server holds it and A's response is held. */
  async function sendA(server: ReturnType<typeof start>) {
    const upload = manager!.uploadPendingMutations();
    await server.committed;
    return upload;
  }

  async function finishA(server: ReturnType<typeof start>, upload: Promise<unknown>) {
    server.release();
    await upload;
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

  async function queuedB() {
    const db = await databaseManager.getDatabase('test');
    return (await db.get(REPLICATION_STORES.PENDING_MUTATIONS, 'mut-B')) as
      PendingMutation | undefined;
  }

  it('(ii-b) pulling A at v4 before its ack is no conflict: B is kept, placement is adopted, and B uploads at v4', async () => {
    const table = new ScoreTable(tableName);
    const server = start(table);
    await seed(table, {}, { result: 'nq', reason: 'R1' });
    const upload = sendA(server);
    await server.committed;

    const outcome = await pull(table, ownWrite({ final_placement: 1 }));

    expect(conflicts).toEqual([]);
    expect(outcome.conflict).toBe(false);
    const mid = await table.getReplicatedRow('1');
    expect(mid?.syncStatus).not.toBe('conflict');
    expect(mid?.data).toMatchObject({ result: 'nq', reason: 'R1', placement: 1 });
    expect(mid?.serverVersion).toBe(4);
    expect(mid?.baseServerVersion).toBe(4);
    expect(mid?.baseData).toEqual(table.adapter().toLocalRow(ownWrite({ final_placement: 1 })));
    expect(mid?.isDirty).toBe(true);
    expect((await queuedB())?.serverVersion).toBe(4);

    // A's ack is processed late: nothing rolls back.
    await finishA(server, upload);
    const after = await table.getReplicatedRow('1');
    expect(after?.serverVersion).toBe(4);
    expect(after?.baseServerVersion).toBe(4);
    expect(after?.baseData).toEqual(table.adapter().toLocalRow(ownWrite({ final_placement: 1 })));
    expect(after?.data).toMatchObject({ result: 'nq', reason: 'R1', placement: 1 });
    expect(after?.isDirty).toBe(true);
    expect((await queuedB())?.serverVersion).toBe(4);
    expect(conflicts).toEqual([]);

    // B is released and goes out with the version the pull handed it.
    const db = await databaseManager.getDatabase('test');
    await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...(await queuedB())!, nextRetryAt: 0 });
    await manager!.uploadPendingMutations();
    expect(server.updates).toHaveLength(2);
    expect(server.updates[1]?.expectedVersion).toBe(4);
    expect(server.row.version).toBe(5);
    expect(server.row.result_status).toBe('nq');
  });

  it('control: v4 is a third party’s write that does not match A, so it still conflicts', async () => {
    const table = new ScoreTable(tableName);
    const server = start(table);
    await seed(table, {}, { result: 'nq', reason: 'R1' });
    const upload = sendA(server);
    await server.committed;

    const outcome = await pull(
      table,
      ownWrite({ result_status: 'excused', reason_text: 'R2', version: 4 })
    );

    expect(outcome.conflict).toBe(true);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fields.sort()).toEqual(['reason', 'result']);
    await finishA(server, upload);
  });

  it('not yet applied: a pull that still shows the pre-A row leaves the base and raises no conflict', async () => {
    const table = new ScoreTable(tableName);
    const server = start(table);
    await seed(table, {}, { result: 'nq', reason: 'R1' });
    const before = await table.getReplicatedRow('1');
    const upload = sendA(server);
    await server.committed;

    const outcome = await pull(
      table,
      ownWrite({ result_status: 'abs', reason_text: 'R0', version: 3 })
    );

    expect(outcome.conflict).toBe(false);
    expect(conflicts).toEqual([]);
    const row = await table.getReplicatedRow('1');
    expect(row?.baseData).toEqual(before?.baseData);
    expect(row?.baseServerVersion).toBe(before?.baseServerVersion);
    await finishA(server, upload);
  });

  it('P1: a correction that restores a pre-save value keeps it under the same interleaving', async () => {
    const table = new ScoreTable(tableName);
    const server = start(table);
    await seed(table, {}, { result: 'nq', reason: 'R0' });
    const upload = sendA(server);
    await server.committed;

    const outcome = await pull(table, ownWrite());

    expect(conflicts).toEqual([]);
    expect(outcome.conflict).toBe(false);
    const row = await table.getReplicatedRow('1');
    expect(row?.data).toMatchObject({ result: 'nq', reason: 'R0' });
    expect(row?.isDirty).toBe(true);
    expect(await queuedB()).toBeDefined();
    await finishA(server, upload);
    expect((await table.getReplicatedRow('1'))?.data).toMatchObject({ result: 'nq', reason: 'R0' });
  });

  it('late-ack re-stamp: after the row reconciles v5, A’s v4 ack leaves B stamped 5', async () => {
    const table = new ScoreTable(tableName);
    const server = start(table);
    await seed(table, {}, { result: 'nq', reason: 'R1' });
    const upload = sendA(server);
    await server.committed;

    // Another device changed only the placement at v5 (B never touched it).
    const outcome = await pull(
      table,
      ownWrite({
        result_status: 'abs',
        reason_text: 'R0',
        final_placement: 6,
        version: 5,
      })
    );
    expect(outcome.conflict).toBe(false);
    expect((await queuedB())?.serverVersion).toBe(5);

    await finishA(server, upload);

    expect((await queuedB())?.serverVersion).toBe(5);
    const row = await table.getReplicatedRow('1');
    expect(row?.serverVersion).toBe(5);
    expect(row?.baseServerVersion).toBe(5);
  });

  describe('P2: the class compare policy under the same interleaving', () => {
    const policy: DirtyRowComparePolicy = {
      normalizeValue: (field, value) =>
        field === 'result' && typeof value === 'string' ? value.toLowerCase() : value,
      serverWinsFields: ['endedAt'],
    };

    it('adopts the server’s completion stamp and respelled status while A is unacknowledged', async () => {
      const table = new ScoreTable(tableName, policy);
      const server = start(table);
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
      await table.set(
        '1',
        { id: '1', result: 'Done', reason: 'R1', placement: null, endedAt: 'device-stamp' },
        true
      );
      await db.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        mutation('mut-B', { result_status: 'Done', reason_text: 'R1' }, 3, {
          nextRetryAt: Date.now() + 3_600_000,
        })
      );
      const upload = sendA(server);
      await server.committed;

      const outcome = await pull(
        table,
        ownWrite({ result_status: 'done', reason_text: 'R0', ended_at: 'server-stamp' })
      );

      expect(conflicts).toEqual([]);
      expect(outcome.conflict).toBe(false);
      const row = await table.getReplicatedRow('1');
      expect(row?.data).toMatchObject({ reason: 'R1', endedAt: 'server-stamp' });
      expect(row?.serverVersion).toBe(4);
      await finishA(server, upload);
    });

    it('adopts the server’s stamp when A wrote only the completion stamp (no other field agrees)', async () => {
      const table = new ScoreTable(tableName, policy);
      const server = start(table);
      await table.set(
        '1',
        { id: '1', result: 'abs', reason: 'R0', placement: null, endedAt: null },
        false,
        undefined,
        3
      );
      await table.set(
        '1',
        { id: '1', result: 'abs', reason: 'R0', placement: null, endedAt: 'device-stamp' },
        true
      );
      const db = await databaseManager.getDatabase('test');
      await db.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        mutation('mut-A', { ended_at: 'device-stamp' }, 3)
      );
      await table.set(
        '1',
        { id: '1', result: 'abs', reason: 'R1', placement: null, endedAt: 'device-stamp' },
        true
      );
      await db.put(
        REPLICATION_STORES.PENDING_MUTATIONS,
        mutation('mut-B', { result_status: 'abs', reason_text: 'R1' }, 3, {
          nextRetryAt: Date.now() + 3_600_000,
        })
      );
      const upload = sendA(server);
      await server.committed;

      const outcome = await pull(
        table,
        ownWrite({ result_status: 'abs', reason_text: 'R0', ended_at: 'server-stamp' })
      );

      expect(conflicts).toEqual([]);
      expect(outcome.conflict).toBe(false);
      const row = await table.getReplicatedRow('1');
      expect(row?.data).toMatchObject({ reason: 'R1', endedAt: 'server-stamp' });
      await finishA(server, upload);
    });
  });
});
