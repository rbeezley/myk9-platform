/**
 * MYK9-662: `ADD COLUMN junior_handler_fee` leaves `updated_at` alone, so an
 * incremental pull never re-sends a show a device cached before the column
 * existed. The desk then reads that show's junior fee as "unknown" and refuses
 * cash and check entries offline. A cached row without the column must trigger
 * one full pull; a row that carries it (null included) must not.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedShowsTable, type ReplicatedShow } from '../ReplicatedShowsTable';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const CLUB = 'club-123';

function cachedShow(overrides: Partial<ReplicatedShow> = {}): ReplicatedShow {
  return {
    id: 'show-1',
    name: 'Fall Trial',
    organization: 'AKC',
    startDate: '2026-11-07T00:00:00+00:00',
    endDate: '2026-11-08T00:00:00+00:00',
    entryOpenDate: '2026-10-01T00:00:00+00:00',
    entryCloseDate: '2026-10-24T00:00:00+00:00',
    clubId: CLUB,
    ...overrides,
  };
}

describe('ReplicatedShowsTable junior fee backfill', () => {
  let table: ReplicatedShowsTable;
  let gt: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedShowsTable();
    const { supabase } = await import('@/services/database/supabaseClient');
    // The first pull seeds the incremental watermark from this row's updated_at
    // and caches a show whose junior_handler_fee arrived as an explicit null.
    const result = {
      data: [
        {
          id: 'show-seed',
          name: 'Seed Show',
          organization: 'AKC',
          start_date: '2026-11-07T00:00:00+00:00',
          end_date: '2026-11-08T00:00:00+00:00',
          entry_open_date: '2026-10-01T00:00:00+00:00',
          entry_close_date: '2026-10-24T00:00:00+00:00',
          club_id: CLUB,
          junior_handler_fee: null,
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
      error: null,
    };
    const eq = vi.fn().mockResolvedValue(result);
    gt = vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ eq }) });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ is: vi.fn().mockReturnValue({ gt }) }),
    } as never);
    // First sync establishes the incremental watermark.
    await table.sync(CLUB);
    gt.mockClear();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  const pulledSince = () => new Date(gt.mock.calls[0]?.[1] as string).getTime();

  it('pulls in full when a cached show predates the column', async () => {
    await table.set('show-1', cachedShow());
    await table.sync(CLUB);
    expect(gt).toHaveBeenCalledTimes(1);
    expect(pulledSince()).toBe(0);
  });

  it('stays incremental once every cached show carries the column, null included', async () => {
    await table.set('show-1', cachedShow({ juniorHandlerFee: null }));
    expect((await table.get('show-seed'))?.juniorHandlerFee).toBeNull();
    await table.sync(CLUB);
    expect(gt).toHaveBeenCalledTimes(1);
    expect(pulledSince()).toBeGreaterThan(0);
  });

  it('ignores a pre-column show that belongs to another club', async () => {
    await table.set('show-1', cachedShow({ clubId: 'club-other' }));
    await table.sync(CLUB);
    expect(gt).toHaveBeenCalledTimes(1);
    expect(pulledSince()).toBeGreaterThan(0);
  });
});
