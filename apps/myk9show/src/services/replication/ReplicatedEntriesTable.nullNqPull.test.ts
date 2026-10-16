/**
 * MYK9-1236: a judge saves Q, then corrects it to NQ. The Q save wrote
 * `disqualification_reason: null`; the server's null column maps to `undefined`
 * on the local row. A dirty NQ edit meeting the next pull must not read that
 * null/undefined difference as the server changing the reason.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing } from '@myk9/replication';
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

function mockServerRows(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'gt', 'or', 'order', 'eq', 'range', 'in']) {
    chain[step] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null, count: rows.length }).then(resolve);
  vi.mocked(supabase.from).mockReturnValue(chain as never);
  return chain;
}

const serverRow = (overrides: Record<string, unknown>) => ({
  id: ID,
  show_id: SHOW,
  class_id: 'class-1',
  dog_id: 'dog-1',
  armband: '200',
  entry_status: 'confirmed',
  result_status: 'qualified',
  disqualification_reason: null,
  version: 7,
  updated_at: '2026-10-08T01:54:59.031578+00:00',
  ...overrides,
});

describe('entry correction Q to NQ against a pull (MYK9-1236)', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    configureConflictSurfacing(true);
    vi.mocked(supabase.from).mockReset();
    table = new ReplicatedEntriesTable();
    await table.clearCache();
    await table.batchSet([seed]);
    // The Q save: acknowledged and clean, its null reason still on the local row.
    await table.updateEntry(ID, { resultStatus: 'qualified', disqualification_reason: null });
    await table.markAsSynced(ID);
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    configureConflictSurfacing(false);
    await databaseManager.reset();
  });

  it('keeps the NQ correction when the pull returns the null reason the Q save wrote', async () => {
    await table.updateEntry(ID, {
      resultStatus: 'nq',
      disqualification_reason: 'Incorrect Call',
    });
    mockServerRows([serverRow({ version: 8 })]);

    await table.sync(SHOW);

    const row = await table.getReplicatedRow(ID);
    expect(row?.conflict ?? null).toBeNull();
    expect(row?.syncStatus).toBe('pending');
    expect(row?.data.resultStatus).toBe('nq');
    expect(row?.data.disqualification_reason).toBe('Incorrect Call');
  });

  it('still surfaces a different reason another device wrote meanwhile', async () => {
    await table.updateEntry(ID, {
      resultStatus: 'nq',
      disqualification_reason: 'Incorrect Call',
    });
    mockServerRows([
      serverRow({ version: 8, result_status: 'nq', disqualification_reason: 'Absent' }),
    ]);

    await table.sync(SHOW);

    const row = await table.getReplicatedRow(ID);
    expect(row?.conflict?.fields).toContain('disqualification_reason');
    expect(row?.syncStatus).toBe('conflict');
  });
});
