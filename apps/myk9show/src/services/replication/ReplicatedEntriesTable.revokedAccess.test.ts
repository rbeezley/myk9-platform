/**
 * MYK9-1521: after a role is revoked to zero the very next sync clears the
 * show's cached rows. The incremental delta of a caller who reads nothing is
 * empty, so the probe's `caller_has_access: false` is what triggers the
 * full-sync cleanup (`verifyScopeEmpty`) in that same sync.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { resetEntriesChangedSinceWarning } from './entriesChangedSince';
import { REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN as BUFFER } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@myk9/core';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const W = Date.UTC(2026, 9, 30, 12, 0, 0);
const NO_ACCESS_RPC = 'entry_results_caller_has_no_show_access';
const iso = (ms: number) => new Date(ms).toISOString();

const seeds = ['entry-1', 'entry-2'].map(
  id =>
    ({
      id,
      showId: SHOW,
      classId: 'class-1',
      dogId: `dog-${id}`,
      armband: id,
      entryStatus: 'confirmed',
      resultStatus: 'pending',
    }) as ReplicatedEntry
);

function mockEmptyServer() {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'gt', 'or', 'order', 'eq', 'range', 'in']) {
    chain[step] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);
  vi.mocked(supabase.from).mockReturnValue(chain as never);
}

/** The probe's answer; `access` omitted models a server older than the migration. */
function mockRpc(probe: unknown, opts: { noAccessProof?: boolean } = {}) {
  vi.mocked(supabase.rpc).mockReset();
  vi.mocked(supabase.rpc).mockImplementation(((fn: string) => {
    if (fn === 'entry_results_changed_since') {
      return Promise.resolve({ data: probe, error: null });
    }
    if (fn === NO_ACCESS_RPC) {
      return Promise.resolve({ data: opts.noAccessProof ?? true, error: null });
    }
    return Promise.resolve({ data: null, error: { message: 'not available' } });
  }) as never);
}

const probeAnswer = (access?: unknown) => ({
  changed: true,
  server_now: iso(W + BUFFER + 10),
  ...(access === undefined ? {} : { caller_has_access: access }),
});

describe('revoke-to-zero clears the show on the next sync (MYK9-1521)', () => {
  let table: ReplicatedEntriesTable;
  let deviceClock = W;

  async function incrementalPass() {
    await table.updateSyncMetadata(
      { lastIncrementalSyncAt: W, lastFullSyncAt: deviceClock },
      { scopeValue: SHOW }
    );
    // The cached rows were written at W; cleanup only removes rows synced before the fetch began.
    deviceClock = W + 60_000;
    return table.sync(SHOW);
  }

  const rpcCalls = (name: string) =>
    vi.mocked(supabase.rpc).mock.calls.filter(([fn]) => fn === name);

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(logger.warn).mockClear();
    resetEntriesChangedSinceWarning();
    vi.spyOn(Date, 'now').mockImplementation(() => deviceClock);
    deviceClock = W;
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.batchSet(seeds);
    vi.mocked(supabase.from).mockReset();
    mockEmptyServer();
    // The show's first sync is full; a probe-less empty answer proves nothing, so the rows stay.
    mockRpc(probeAnswer());
    await table.sync(SHOW, { forceFullSync: true });
    expect(await table.getEntriesByShow(SHOW)).toHaveLength(2);
    resetEntriesChangedSinceWarning();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('clears the show in ONE incremental sync when the probe says the caller has no access', async () => {
    mockRpc(probeAnswer(false));
    const result = await incrementalPass();

    expect(result.success).toBe(true);
    expect(await table.getEntriesByShow(SHOW)).toEqual([]);
    // The purge is the full-sync cleanup: it re-proves the emptiness independently.
    expect(rpcCalls(NO_ACCESS_RPC)).toEqual([[NO_ACCESS_RPC, { p_show_id: SHOW }]]);
  });

  it('runs no purge pass when every remaining row holds unsynced local work (no re-run every poll)', async () => {
    // The cleanup keeps such rows (a revoked scorer's queued scores), so purging
    // for them would repeat on every poll without removing anything.
    vi.spyOn(table, 'hasUnsyncedLocalWork').mockResolvedValue(true);
    mockRpc(probeAnswer(false));
    const result = await incrementalPass();

    expect(result.operation).toBe('incremental-sync');
    expect(rpcCalls(NO_ACCESS_RPC)).toHaveLength(0);
    expect(await table.getEntriesByShow(SHOW)).toHaveLength(2);
  });

  it('keeps the rows when the independent proof does not confirm (never purge on doubt)', async () => {
    mockRpc(probeAnswer(false), { noAccessProof: false });
    await incrementalPass();
    expect(await table.getEntriesByShow(SHOW)).toHaveLength(2);
  });

  it.each([
    ['true', probeAnswer(true)],
    ['absent (server older than the migration)', probeAnswer()],
  ])('never purges when caller_has_access is %s', async (_label, probe) => {
    mockRpc(probe);
    await incrementalPass();

    expect(await table.getEntriesByShow(SHOW)).toHaveLength(2);
    expect(rpcCalls(NO_ACCESS_RPC)).toHaveLength(0);
  });

  it.each([
    ['a non-boolean caller_has_access', probeAnswer('no')],
    ['an unparseable answer', { changed: 'yes' }],
  ])("falls back to today's behavior on %s", async (_label, probe) => {
    mockRpc(probe);
    const result = await incrementalPass();

    expect(result.success).toBe(true);
    expect(result.operation).toBe('incremental-sync');
    expect(await table.getEntriesByShow(SHOW)).toHaveLength(2);
    expect(rpcCalls(NO_ACCESS_RPC)).toHaveLength(0);
  });

  it('does not purge when the probe fails (offline or error)', async () => {
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'offline' },
    } as never);
    await incrementalPass();
    expect(await table.getEntriesByShow(SHOW)).toHaveLength(2);
  });
});
