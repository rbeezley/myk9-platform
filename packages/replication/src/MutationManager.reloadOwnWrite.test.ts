import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetConflictSurfacingForTests, configureConflictSurfacing } from './conflictConfig';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import type { Logger } from './dependencies';
import { MutationManager } from './MutationManager';
import { reconcileDirtyRemoteRow } from './reconcileDirtyRemoteRow';
import { AUTH, ScoreTable, type RemoteScore } from './test-utils/ackRebaseFixtures';
import type { PendingMutation } from './types';

/**
 * MYK9-2371. A judge's score A commits on the server, the reply never reaches
 * the phone, and the phone reloads (a new MutationManager over the same
 * IndexedDB). The judge then changes the same dog again (B, same fields). Does
 * the phone end up in a same-field conflict that names its own write A as the
 * server side?
 *
 * The upload goes through the real runner and supabase-js, against a stub of
 * `ringside_update_entry` that mirrors the server's rules: OCC on
 * `p_expected_version`, plus the replay check (MYK9-740) that acknowledges a
 * stale request whose values equal what is stored. A download is the real
 * `reconcileDirtyRemoteRow`, the function the sync loop and the single-row
 * re-fetch both call.
 */
describe('a reload between the server commit and the reply (MYK9-2371)', () => {
  let tableName: string;
  let manager: MutationManager | undefined;
  let conflicts: Array<{
    fields: string[];
    remoteData: { result: string | null; reason: string | null };
  }>;

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
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
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

  /**
   * What `ringside_update_entry` keeps of p_fields: only its allowed list is applied, so an unknown
   * field is dropped. The shared fixture row stores the free-text reason in `reason_text`; here
   * that column stands for the allowed `disqualification_reason`.
   */
  function toRowColumns(fields: Record<string, unknown>): Record<string, unknown> {
    const columns: Record<string, unknown> = {};
    if ('result_status' in fields) columns.result_status = fields.result_status;
    if ('disqualification_reason' in fields) columns.reason_text = fields.disqualification_reason;
    return columns;
  }

  /** `ringside_update_entry` as a stub server, with a switch that drops replies. */
  function makeRpcServer() {
    const row: RemoteScore = {
      id: '1',
      result_status: 'absent',
      reason_text: 'R0',
      final_placement: null,
      ended_at: null,
      version: 3,
    };
    const sent: Array<{ expected: number | null; fields: Record<string, unknown> }> = [];
    let dropReplies = true;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        p_fields: Record<string, unknown>;
        p_expected_version: number | null;
      };
      sent.push({ expected: body.p_expected_version, fields: body.p_fields });
      const columns = toRowColumns(body.p_fields);
      const sameValues = Object.entries(columns).every(
        ([column, value]) => (row as unknown as Record<string, unknown>)[column] === value
      );
      if (body.p_expected_version === row.version) {
        Object.assign(row, columns, { version: row.version + 1 });
        if (dropReplies) throw new TypeError('Failed to fetch');
        return json(row.version);
      }
      if (sameValues) return json(row.version);
      return json(
        { code: '40001', message: 'version conflict', details: String(row.version), hint: null },
        409
      );
    });
    const supabase = createClient('https://example.supabase.co', 'test-anon-key', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { fetch },
    });
    return {
      row,
      sent,
      supabase,
      restoreReplies: () => {
        dropReplies = false;
      },
    };
  }

  /** The reload: a fresh manager over the same IndexedDB, wired to the table. */
  function boot(table: ScoreTable, supabase: ReturnType<typeof makeRpcServer>['supabase']) {
    const logger: Logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    manager?.destroy();
    manager = new MutationManager(supabase, {
      logger,
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase }),
    });
    table.setMutationManager(manager);
    return manager;
  }

  async function queueScore(
    table: ScoreTable,
    result: string,
    reason: string | null,
    serverVersion: number
  ) {
    await table.set('1', { id: '1', result, reason, placement: null, endedAt: null }, true);
    await manager!.queueMutation(
      tableName,
      'UPDATE',
      '1',
      { id: '1', result_status: result, reason_text: reason },
      undefined,
      serverVersion,
      {
        name: 'ringside_update_entry',
        fields: { result_status: result, disqualification_reason: reason },
      },
      false
    );
  }

  /** Lets every queued write be sent now, as the backoff after a dropped reply elapses. */
  async function releaseBackoff() {
    const db = await databaseManager.getDatabase('test');
    const queued = (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
    for (const mutation of queued) {
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...mutation, nextRetryAt: 0 });
    }
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

  /** Score A is sent and committed, its reply is dropped, the phone reloads, B is queued. */
  async function sendAThenReloadThenQueueB() {
    const table = new ScoreTable(tableName);
    const server = makeRpcServer();
    boot(table, server.supabase);
    await table.set(
      '1',
      { id: '1', result: 'absent', reason: 'R0', placement: null, endedAt: null },
      false,
      undefined,
      3
    );
    await queueScore(table, 'qualified', null, 3);
    await manager!.uploadPendingMutations();
    expect(server.row).toMatchObject({ result_status: 'qualified', reason_text: null, version: 4 });
    // The reply never arrived: A is still queued, the row still holds version 3.
    expect(await manager!.getPendingCount()).toBe(1);
    expect((await table.getReplicatedRow('1'))?.serverVersion).toBe(3);

    boot(table, server.supabase);
    await queueScore(table, 'nq', 'R1', 3);
    server.restoreReplies();
    await releaseBackoff();
    return { table, server };
  }

  it('upload first: A is recognised as applied, so B is sent at the advanced version and no conflict is raised', async () => {
    const { table, server } = await sendAThenReloadThenQueueB();

    await manager!.uploadPendingMutations();

    expect(conflicts).toEqual([]);
    expect(server.sent.map(call => call.expected)).toEqual([3, 3, 4]);
    expect(server.row).toMatchObject({ result_status: 'nq', reason_text: 'R1', version: 5 });
    expect(await manager!.getPendingCount()).toBe(0);
    expect((await table.getReplicatedRow('1'))?.syncStatus).not.toBe('conflict');
  });

  // The ordering that does conflict: the download lands after the reload but
  // before A is replayed. The in-flight record of A died with the page, so the
  // snapshot (A's values, version 4) is read as another writer's change to the
  // fields B also changed.
  //
  // CURRENT BEHAVIOUR, asserted on purpose. The owner deferred option B (silent
  // recognition of the device's own write, which needs a server-verifiable
  // mutation id) on 2026-11-24. This pins the conflict and the "server side" it
  // reports so the wording change in entryConflictCopy.ts stays honest.
  it('download first: the conflict names A as the server side, because the phone cannot tell it wrote A', async () => {
    const { table, server } = await sendAThenReloadThenQueueB();

    const outcome = await pull(table, { ...server.row });

    expect(outcome.conflict).toBe(true);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.fields.sort()).toEqual(['reason', 'result']);
    expect(conflicts[0]?.remoteData).toMatchObject({ result: 'qualified', reason: null });
    expect((await table.getReplicatedRow('1'))?.syncStatus).toBe('conflict');
  });
});
