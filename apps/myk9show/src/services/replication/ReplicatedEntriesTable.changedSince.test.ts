/**
 * MYK9-1369: an incremental entries pull asks `entry_results_changed_since`
 * first, and a definite `false` skips the results view read. Any other answer
 * (true, an error, a throw, a non-boolean) and any full sync read the view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { resetEntriesChangedSinceWarning } from './entriesChangedSince';
import { features } from '@/config/features';
import { REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN as BUFFER } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@myk9/core';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const ID = 'entry-1';
const VIEW = 'view_authenticated_entry_results_replication';
const W = Date.UTC(2026, 9, 28, 12, 0, 0);
const SETTLED = W + BUFFER + 10;
const EARLY = W + 1000;

const seed = {
  id: ID,
  showId: SHOW,
  classId: 'class-1',
  dogId: 'dog-1',
  armband: '200',
  entryStatus: 'confirmed',
  resultStatus: 'pending',
} as ReplicatedEntry;

/** Every `select(...)` the view chain received; the delta read is the one that selects `*`. */
const selects: unknown[][] = [];

function mockServerRows(rows: Record<string, unknown>[], error?: { message: string }) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'gt', 'or', 'order', 'eq', 'range', 'in']) {
    chain[step] = vi.fn((...args: unknown[]) => {
      if (step === 'select') selects.push(args);
      return chain;
    });
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: error ? null : rows, error: error ?? null, count: rows.length }).then(
      resolve
    );
  vi.mocked(supabase.from).mockReturnValue(chain as never);
  return chain;
}

const serverRow = {
  id: ID,
  show_id: SHOW,
  class_id: 'class-1',
  dog_id: 'dog-1',
  armband: '200',
  entry_status: 'confirmed',
  result_status: 'qualified',
  version: 7,
  updated_at: '2026-10-28T12:00:30.000+00:00',
};

/** The delta page read (`select('*')` on the view); the coverage count selects `id` only. */
const viewReads = () =>
  vi.mocked(supabase.from).mock.calls.filter(([name]) => name === VIEW).length > 0
    ? selects.filter(args => args[0] === '*')
    : [];

describe('entries incremental pull probes entry_results_changed_since (MYK9-1369)', () => {
  let table: ReplicatedEntriesTable;
  let clock = W;

  /** One engine-shaped incremental pass: watermark W, so the engine asks since = W - buffer. */
  async function pass(watermark: number, now: number, options: { forceFullSync?: boolean } = {}) {
    clock = now;
    await table.updateSyncMetadata(
      { lastIncrementalSyncAt: watermark, lastFullSyncAt: now },
      { scopeValue: SHOW }
    );
    vi.mocked(supabase.rpc).mockClear();
    selects.length = 0;
    return table.sync(SHOW, options);
  }

  const probes = () =>
    vi.mocked(supabase.rpc).mock.calls.filter(([fn]) => fn === 'entry_results_changed_since');

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(logger.warn).mockClear();
    resetEntriesChangedSinceWarning();
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
    clock = W;
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.batchSet([seed]);
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
    mockServerRows([]);
    // A show's first sync is full anyway (receipt-reference refresh); it records nothing.
    await pass(W, W);
    resetEntriesChangedSinceWarning();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('1. first incremental pass: no earlier read, so the view is read and no RPC is sent', async () => {
    await pass(W, SETTLED);

    expect(probes()).toHaveLength(0);
    expect(viewReads()).toHaveLength(1);
  });

  it('2. same watermark but the earlier read started inside the buffer: view read, no RPC', async () => {
    await pass(W, EARLY);
    await pass(W, EARLY + 1000);

    expect(probes()).toHaveLength(0);
    expect(viewReads()).toHaveLength(1);
  });

  it('3. same watermark and a read that started after W + buffer: probes at exactly W', async () => {
    await pass(W, SETTLED);
    mockServerRows([serverRow]);
    await pass(W, SETTLED + 60_000);

    expect(supabase.rpc).toHaveBeenCalledWith('entry_results_changed_since', {
      p_show_id: SHOW,
      p_since: new Date(W).toISOString(),
    });
    expect(viewReads()).toHaveLength(0);
    expect((await table.get(ID))?.resultStatus).toBe('pending');
  });

  it.each([
    ['true', { data: true, error: null }],
    ['an error', { data: null, error: { message: 'function not found' } }],
    ['a non-boolean', { data: 'false', error: null }],
  ])('4. an answer of %s reads the view', async (_name, answer) => {
    await pass(W, SETTLED);
    vi.mocked(supabase.rpc).mockResolvedValue(answer as never);

    await pass(W, SETTLED + 60_000);

    expect(probes()).toHaveLength(1);
    expect(viewReads()).toHaveLength(1);
    // The read it just made settled too, so the next quiet pass probes again.
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
    await pass(W, SETTLED + 120_000);
    expect(probes()).toHaveLength(1);
    expect(viewReads()).toHaveLength(0);
  });

  it('warns once when the RPC errors', async () => {
    await pass(W, SETTLED);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'nope' } } as never);
    await pass(W, SETTLED + 60_000);
    await pass(W, SETTLED + 120_000);

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('5. a changed watermark does not match the earlier read: view read, no RPC', async () => {
    await pass(W, SETTLED);
    await pass(W + 30_000, SETTLED + 60_000);

    expect(probes()).toHaveLength(0);
    expect(viewReads()).toHaveLength(1);
  });

  it('6. a failed view read records nothing, so the next pass reads the view', async () => {
    await pass(W, SETTLED);
    mockServerRows([], { message: 'boom' });
    await pass(W + 30_000, SETTLED + 60_000);
    mockServerRows([]);

    // Same W as the failed pass, long settled: still no record, so no RPC.
    await pass(W + 30_000, SETTLED + 120_000);

    expect(probes()).toHaveLength(0);
    expect(viewReads()).toHaveLength(1);
  });

  it('7. a full sync neither probes nor records', async () => {
    await pass(W, SETTLED);
    await pass(W, SETTLED + 60_000, { forceFullSync: true });
    expect(probes()).toHaveLength(0);
    expect(viewReads().length).toBeGreaterThan(0);

    // Had the full sync recorded, this settled same-W pass would probe.
    await pass(W + 1, SETTLED + 120_000);
    await pass(W + 1, SETTLED + 180_000);
    expect(probes()).toHaveLength(1);
  });

  it('does not call the RPC when the flag is off', async () => {
    await pass(W, SETTLED);
    const original = features.replicationEntriesChangedSince;
    (features as { replicationEntriesChangedSince: boolean }).replicationEntriesChangedSince =
      false;
    try {
      await pass(W, SETTLED + 60_000);
    } finally {
      (features as { replicationEntriesChangedSince: boolean }).replicationEntriesChangedSince =
        original;
    }

    expect(probes()).toHaveLength(0);
    expect(viewReads()).toHaveLength(1);
  });
});
