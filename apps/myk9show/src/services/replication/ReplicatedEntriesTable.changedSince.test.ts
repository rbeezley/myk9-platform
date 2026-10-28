/**
 * MYK9-1369: an incremental entries pull asks `entry_results_changed_since`
 * first, and a definite `false` skips the results view read. Any other answer
 * (true, an error, a throw, a non-boolean) and any full sync read the view.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { resetEntriesChangedSinceWarning } from './entriesChangedSince';
import { features } from '@/config/features';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@myk9/core';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const ID = 'entry-1';
const VIEW = 'view_authenticated_entry_results_replication';
const WATERMARK = Date.UTC(2026, 9, 28, 12, 0, 0);

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

function mockServerRows(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'gt', 'or', 'order', 'eq', 'range', 'in']) {
    chain[step] = vi.fn((...args: unknown[]) => {
      if (step === 'select') selects.push(args);
      return chain;
    });
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
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

  /** A warm replica: the first sync of a show is full anyway, so run it once. */
  async function warmTable(): Promise<ReplicatedEntriesTable> {
    mockServerRows([]);
    await table.sync(SHOW);
    const fresh = new ReplicatedEntriesTable();
    await fresh.updateSyncMetadata(
      { lastIncrementalSyncAt: WATERMARK, lastFullSyncAt: Date.now() },
      { scopeValue: SHOW }
    );
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    selects.length = 0;
    return fresh;
  }

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(logger.warn).mockClear();
    resetEntriesChangedSinceWarning();
    selects.length = 0;
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.batchSet([seed]);
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('sends the show and the watermark, and reads no view when the answer is false', async () => {
    const warm = await warmTable();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
    mockServerRows([serverRow]);

    await warm.sync(SHOW);

    expect(supabase.rpc).toHaveBeenCalledWith('entry_results_changed_since', {
      p_show_id: SHOW,
      p_since: expect.stringMatching(/^2026-10-28T1[12]:\d\d:\d\d\.\d{3}Z$/),
    });
    const args = vi.mocked(supabase.rpc).mock.calls[0][1] as { p_since: string };
    expect(new Date(args.p_since).getTime()).toBeLessThanOrEqual(WATERMARK);
    expect(viewReads()).toHaveLength(0);
    expect((await warm.get(ID))?.resultStatus).toBe('pending');
  });

  it('reads the view as today when the answer is true', async () => {
    const warm = await warmTable();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as never);
    mockServerRows([serverRow]);

    await warm.sync(SHOW);

    expect(viewReads().length).toBeGreaterThan(0);
    expect((await warm.get(ID))?.resultStatus).toBe('qualified');
  });

  it('reads the view and warns once when the RPC errors', async () => {
    const warm = await warmTable();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { message: 'function not found' },
    } as never);
    mockServerRows([serverRow]);

    await warm.sync(SHOW);
    await warm.sync(SHOW);

    expect(viewReads().length).toBeGreaterThan(0);
    expect((await warm.get(ID))?.resultStatus).toBe('qualified');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('reads the view when the RPC throws or answers a non-boolean', async () => {
    const warm = await warmTable();
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network'));
    mockServerRows([serverRow]);
    await warm.sync(SHOW);
    expect(viewReads().length).toBeGreaterThan(0);

    vi.mocked(supabase.from).mockReset();
    selects.length = 0;
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'false', error: null } as never);
    mockServerRows([serverRow]);
    await warm.sync(SHOW);
    expect(viewReads().length).toBeGreaterThan(0);
  });

  it('does not call the RPC when the flag is off', async () => {
    const warm = await warmTable();
    mockServerRows([serverRow]);
    const original = features.replicationEntriesChangedSince;
    (features as { replicationEntriesChangedSince: boolean }).replicationEntriesChangedSince =
      false;
    try {
      await warm.sync(SHOW);
    } finally {
      (features as { replicationEntriesChangedSince: boolean }).replicationEntriesChangedSince =
        original;
    }

    expect(supabase.rpc).not.toHaveBeenCalledWith('entry_results_changed_since', expect.anything());
    expect(viewReads().length).toBeGreaterThan(0);
  });

  it('does not call the RPC on a full sync', async () => {
    const warm = await warmTable();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
    mockServerRows([serverRow]);

    await warm.sync(SHOW, { forceFullSync: true });

    expect(supabase.rpc).not.toHaveBeenCalledWith('entry_results_changed_since', expect.anything());
    expect(viewReads().length).toBeGreaterThan(0);
  });

  it('does not call the RPC on a cold first sync (since = 0)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
    mockServerRows([serverRow]);

    await table.sync(SHOW);

    expect(supabase.rpc).not.toHaveBeenCalledWith('entry_results_changed_since', expect.anything());
    expect(viewReads().length).toBeGreaterThan(0);
  });
});
