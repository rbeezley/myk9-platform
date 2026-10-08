/**
 * MYK9-1050: a device that scored a class never saw the server's placements.
 *
 * `updateEntry` stamps `_syncStatus: 'pending'` INSIDE the row's data. The
 * upload ack clears the wrapper (`isDirty`, `syncStatus`) but never that data
 * flag, and `resolveConflict` read the data flag, so every later pull of the
 * row (the server recalculated `final_placement` after the score) kept the
 * stale local copy. A row the wrapper still holds dirty is protected earlier,
 * in `syncReplicatedTable`, and never reaches `resolveConflict`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const SHOW = 'show-1';
const ID = 'entry-1';

const seed = {
  id: ID,
  showId: SHOW,
  classId: 'class-1',
  dogId: 'dog-1',
  armband: '200',
  entryStatus: 'confirmed',
  resultStatus: 'pending',
} as ReplicatedEntry;

/** A thenable query chain: every builder step returns it, awaiting yields the rows. */
function mockServerRows(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'gt', 'or', 'order', 'eq', 'range']) {
    chain[step] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
  vi.mocked(supabase.from).mockReturnValue(chain as never);
}

const serverRow = (overrides: Record<string, unknown>) => ({
  id: ID,
  show_id: SHOW,
  class_id: 'class-1',
  dog_id: 'dog-1',
  armband: '200',
  entry_status: 'confirmed',
  result_status: 'qualified',
  final_placement: 1,
  version: 7,
  updated_at: '2026-10-08T01:54:59.031578+00:00',
  ...overrides,
});

describe('ReplicatedEntriesTable pull after an acknowledged local score (MYK9-1050)', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(supabase.from).mockReset();
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.batchSet([seed]);
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('takes the server-computed placement once the local score is acknowledged', async () => {
    await table.updateEntry(ID, { resultStatus: 'qualified' });
    await table.markAsSynced(ID);
    mockServerRows([serverRow({})]);

    await table.sync(SHOW);

    const entry = await table.get(ID);
    expect(entry?.finalPlacement).toBe('1');
    expect(entry?.resultStatus).toBe('qualified');
  });

  it('does not report an acknowledged score as pending local work', async () => {
    await table.updateEntry(ID, { resultStatus: 'qualified' });
    expect((await table.get(ID))?._syncStatus).toBe('pending');

    await table.markAsSynced(ID);

    expect((await table.get(ID))?._syncStatus).toBe('synced');
  });

  it('heals a row an older build left acknowledged with the stale pending flag', async () => {
    await table.set(ID, { ...seed, _syncStatus: 'pending' }, false);
    mockServerRows([serverRow({})]);

    await table.sync(SHOW);

    expect((await table.get(ID))?.finalPlacement).toBe('1');
  });

  it('a download that read the server before the ack does not roll the acked score back', async () => {
    await table.batchSet([{ ...seed, resultStatus: 'qualified' }], new Map([[ID, 7]]));
    mockServerRows([serverRow({ result_status: 'pending', final_placement: undefined, version: 6 })]);

    await table.sync(SHOW);

    expect((await table.get(ID))?.resultStatus).toBe('qualified');
  });

  it('a newer server row (placements recalculated) still wins over the acked score', async () => {
    await table.batchSet([{ ...seed, resultStatus: 'qualified' }], new Map([[ID, 7]]));
    mockServerRows([serverRow({ version: 8 })]);

    await table.sync(SHOW);

    expect((await table.get(ID))?.finalPlacement).toBe('1');
  });

  it('keeps a score that has not uploaded yet (dirty row is not clobbered)', async () => {
    await table.updateEntry(ID, { resultStatus: 'qualified', searchTimeSeconds: 52.1 });
    mockServerRows([serverRow({ result_status: 'pending', final_placement: undefined })]);

    await table.sync(SHOW);

    const entry = await table.get(ID);
    expect(entry?.resultStatus).toBe('qualified');
    expect(entry?._syncStatus).toBe('pending');
  });
});
