/**
 * MYK9-1737: `updateEntryWith` builds its payload from the row the write is
 * based on. On a cold replica (Class Results in a fresh browser profile never
 * runs a per-show entries sync) that row is hydrated from the server first, so
 * a score reset still sees `check_in_status = 'completed'` and moves it back.
 * A plain cache read before `updateEntry` returned null there and silently
 * skipped the check-in half of the reset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { scoreResetCheckInFields } from './scoreResetFields';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const COLD_ROW = {
  id: 'entry-1',
  show_id: 'show-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  entry_status: 'confirmed',
  is_scored: true,
  result_status: 'qualified',
  check_in_status: 'completed',
  version: 7,
};

function mockReadBack(data: unknown) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.maybeSingle = vi.fn(() => Promise.resolve({ data, error: null }));
  vi.mocked(supabase.from).mockReturnValue(node as never);
}

describe('ReplicatedEntriesTable.updateEntryWith (MYK9-1737)', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(supabase.from).mockReset();
    table = new ReplicatedEntriesTable();
    await table.clearCache();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('hands the builder the hydrated row on a cold replica and writes its payload', async () => {
    mockReadBack(COLD_ROW);
    expect(await table.getEntryById('entry-1')).toBeNull();

    const build = vi.fn((current: ReplicatedEntry) => ({
      isScored: false,
      is_scored: false,
      ...scoreResetCheckInFields(current),
    }));
    await table.updateEntryWith('entry-1', build);

    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]?.[0].checkInStatus).toBe('completed');
    const written = await table.getEntryById('entry-1');
    expect(written?.checkInStatus).toBe('checked-in');
    expect(written?.isScored).toBe(false);
  });
});
