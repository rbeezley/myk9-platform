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
/** Server times the probe reports: before and after W + buffer. */
const SETTLED = W + BUFFER + 10;
const EARLY = W + 1000;
const iso = (ms: number) => new Date(ms).toISOString();

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

function mockServerRows(
  rows: Record<string, unknown>[],
  error?: { message: string },
  count = rows.length
) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'gt', 'or', 'order', 'eq', 'range', 'in']) {
    chain[step] = vi.fn((...args: unknown[]) => {
      if (step === 'select') selects.push(args);
      return chain;
    });
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: error ? null : rows, error: error ?? null, count }).then(resolve);
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

type Answer = { data: unknown; error: { message: string } | null };
const quiet = (serverNow: number): Answer => ({
  data: { changed: false, server_now: iso(serverNow) },
  error: null,
});

describe('entries incremental pull probes entry_results_changed_since (MYK9-1369)', () => {
  let table: ReplicatedEntriesTable;
  let deviceClock = W;

  /**
   * One engine-shaped incremental pass: watermark W, so the engine asks
   * since = W - buffer. The probe answers with the given server time.
   */
  async function pass(
    watermark: number,
    answer: Answer,
    options: { forceFullSync?: boolean; deviceNow?: number } = {}
  ) {
    deviceClock = options.deviceNow ?? W;
    await table.updateSyncMetadata(
      { lastIncrementalSyncAt: watermark, lastFullSyncAt: deviceClock },
      { scopeValue: SHOW }
    );
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.rpc).mockResolvedValue(answer as never);
    selects.length = 0;
    return table.sync(SHOW, { forceFullSync: options.forceFullSync });
  }

  const probes = () =>
    vi.mocked(supabase.rpc).mock.calls.filter(([fn]) => fn === 'entry_results_changed_since');

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(logger.warn).mockClear();
    resetEntriesChangedSinceWarning();
    vi.spyOn(Date, 'now').mockImplementation(() => deviceClock);
    deviceClock = W;
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.batchSet([seed]);
    vi.mocked(supabase.from).mockReset();
    mockServerRows([]);
    // A show's first sync is full anyway (receipt-reference refresh); no probe, no record.
    await pass(W, quiet(SETTLED), { forceFullSync: true });
    resetEntriesChangedSinceWarning();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('probes at exactly W on the first incremental pass, and reads the view (no record yet)', async () => {
    await pass(W, quiet(SETTLED));

    expect(probes()).toEqual([
      ['entry_results_changed_since', { p_show_id: SHOW, p_since: iso(W) }],
    ]);
    expect(viewReads()).toHaveLength(1);
  });

  it('records the probe server time: an unsettled record is replaced by a later one', async () => {
    await pass(W, quiet(EARLY));
    await pass(W, quiet(EARLY + 1000));
    expect(viewReads()).toHaveLength(1);

    // Only the replacement (settled) time can license the next skip.
    await pass(W, quiet(SETTLED));
    expect(viewReads()).toHaveLength(1);
    await pass(W, quiet(SETTLED + 1000));
    expect(viewReads()).toHaveLength(0);
  });

  it('skips the view when the probe is false and the last read started after W + buffer', async () => {
    await pass(W, quiet(SETTLED));
    mockServerRows([serverRow]);
    await pass(W, quiet(SETTLED + 60_000));

    expect(probes()).toEqual([
      ['entry_results_changed_since', { p_show_id: SHOW, p_since: iso(W) }],
    ]);
    expect(viewReads()).toHaveLength(0);
    expect((await table.get(ID))?.resultStatus).toBe('pending');
  });

  it('reads the view when the settled probe says changed', async () => {
    await pass(W, quiet(SETTLED));
    await pass(W, { data: { changed: true, server_now: iso(SETTLED + 60_000) }, error: null });

    expect(viewReads()).toHaveLength(1);
  });

  it.each([
    ['an error', { data: null, error: { message: 'function not found' } }],
    ['an array', { data: [{ changed: false, server_now: iso(SETTLED + 60_000) }], error: null }],
    ['a bare boolean', { data: false, error: null }],
    ['a missing server_now', { data: { changed: false }, error: null }],
    ['an invalid server_now', { data: { changed: false, server_now: 'nope' }, error: null }],
    ['a non-boolean changed', { data: { changed: 'no', server_now: iso(SETTLED) }, error: null }],
  ])('%s reads the view and records nothing', async (_name, answer) => {
    await pass(W, quiet(EARLY));
    await pass(W, answer);
    expect(viewReads()).toHaveLength(1);

    // The unparsed pass did not record: this settled-looking pass finds only the EARLY record.
    await pass(W, quiet(SETTLED + 120_000));
    expect(viewReads()).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('reads the view when W changed', async () => {
    await pass(W, quiet(SETTLED));
    await pass(W + 30_000, quiet(SETTLED + 60_000));

    expect(viewReads()).toHaveLength(1);
  });

  it('records nothing when the view read fails', async () => {
    await pass(W, quiet(EARLY));
    mockServerRows([], { message: 'boom' });
    await pass(W + 30_000, quiet(SETTLED + 60_000));
    mockServerRows([]);

    // Same W as the failed pass, settled probe: no record, so the view is read.
    await pass(W + 30_000, quiet(SETTLED + 120_000));
    expect(viewReads()).toHaveLength(1);
  });

  it('sends no probe on a full sync, and a full sync records nothing', async () => {
    await pass(W, quiet(EARLY));
    await pass(W, quiet(SETTLED + 60_000), { forceFullSync: true });
    expect(probes()).toHaveLength(0);
    expect(viewReads().length).toBeGreaterThan(0);

    await pass(W, quiet(SETTLED + 120_000));
    expect(viewReads()).toHaveLength(1);
  });

  it('sends no probe when the flag is off', async () => {
    await pass(W, quiet(SETTLED));
    const original = features.replicationEntriesChangedSince;
    (features as { replicationEntriesChangedSince: boolean }).replicationEntriesChangedSince =
      false;
    try {
      await pass(W, quiet(SETTLED + 60_000));
    } finally {
      (features as { replicationEntriesChangedSince: boolean }).replicationEntriesChangedSince =
        original;
    }

    expect(probes()).toHaveLength(0);
    expect(viewReads()).toHaveLength(1);
  });

  it.each([
    ['an hour ahead', 3_600_000],
    ['an hour behind', -3_600_000],
  ])('ignores the device clock (%s)', async (_name, skew) => {
    // The engine's own count cadence reads the device clock; keep the count matching the replica.
    mockServerRows([], undefined, 1);
    // Unsettled in server time: a fast device clock must not let it skip.
    await pass(W, quiet(EARLY), { deviceNow: W + skew });
    await pass(W, quiet(EARLY + 1000), { deviceNow: W + skew + 10 * BUFFER });
    expect(viewReads()).toHaveLength(1);

    // Settled in server time: a slow device clock must not stop it skipping.
    await pass(W, quiet(SETTLED), { deviceNow: W + skew });
    await pass(W, quiet(SETTLED + 1000), { deviceNow: W + skew - 10 * BUFFER });
    expect(viewReads()).toHaveLength(0);
  });
});
