/**
 * MYK9-716: shows' date columns are timestamptz stored as midnight UTC of the
 * typed calendar day, and every server guard reads
 * `(col AT TIME ZONE 'UTC')::date`. The wizard's online create writes each
 * date through `toLocalDateOnly`; the replicated table's writes (the wizard's
 * edit save, showStore) must send the same calendar day, never the picker's
 * raw instant, which lands on a different UTC day in the evening west of UTC
 * and at local midnight east of it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReplicatedShowsTable, type ReplicatedShow } from '../ReplicatedShowsTable';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

type QueueMutation = (
  operation: string,
  rowId: string,
  payload: Record<string, unknown>
) => Promise<string | null>;

const originalTimezone = process.env.TZ;

const SERVER_MIDNIGHT = '2026-10-01T00:00:00+00:00';

const SERVER_SHAPED_FIELDS: Omit<ReplicatedShow, 'id'> = {
  name: 'Fall Trial',
  organization: 'AKC',
  startDate: '2026-11-07T00:00:00+00:00',
  endDate: '2026-11-08T00:00:00+00:00',
  entryOpenDate: SERVER_MIDNIGHT,
  entryCloseDate: '2026-10-24T00:00:00+00:00',
};

function serverShapedShow(): ReplicatedShow {
  return { id: 'show-1', ...SERVER_SHAPED_FIELDS };
}

describe('ReplicatedShowsTable date writes', () => {
  let table: ReplicatedShowsTable;
  let queueMutation: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedShowsTable();
    queueMutation = vi.spyOn(table as unknown as { queueMutation: QueueMutation }, 'queueMutation');
    queueMutation.mockResolvedValue('mutation-1');
  });

  afterEach(async () => {
    if (originalTimezone) process.env.TZ = originalTimezone;
    else delete process.env.TZ;
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  function lastPayload(): Record<string, unknown> {
    return queueMutation.mock.calls.at(-1)?.[2] as Record<string, unknown>;
  }

  it('sends the typed calendar day for an evening pick in America/Los_Angeles', async () => {
    process.env.TZ = 'America/Los_Angeles';
    // Oct 1, 7:30 PM PDT is 2026-10-02T02:30Z: the raw instant is the NEXT UTC day.
    const eveningPick = new Date(2026, 9, 1, 19, 30).toISOString();
    expect(eveningPick).toBe('2026-10-02T02:30:00.000Z');

    await table.set('show-1', serverShapedShow());
    await table.updateShow('show-1', { entryOpenDate: eveningPick, entryCloseDate: eveningPick });

    expect(queueMutation).toHaveBeenCalledWith(
      'UPDATE',
      'show-1',
      expect.objectContaining({ entry_open_date: '2026-10-01', entry_close_date: '2026-10-01' })
    );
    // The local copy holds the same calendar day the server will.
    expect(await table.get('show-1')).toMatchObject({
      entryOpenDate: '2026-10-01',
      entryCloseDate: '2026-10-01',
    });
  });

  it('sends the typed calendar day for a local-midnight pick in Pacific/Auckland', async () => {
    process.env.TZ = 'Pacific/Auckland';
    // A date picker emits local midnight: Oct 1 NZDT is 2026-09-30T11:00Z, the PREVIOUS UTC day.
    const midnightPick = new Date(2026, 9, 1).toISOString();
    expect(midnightPick).toBe('2026-09-30T11:00:00.000Z');

    await table.set('show-1', serverShapedShow());
    await table.updateShow('show-1', { startDate: midnightPick, endDate: midnightPick });

    expect(lastPayload()).toMatchObject({ start_date: '2026-10-01', end_date: '2026-10-01' });
  });

  it.each(['America/Los_Angeles', 'Pacific/Auckland'])(
    'a server-shaped midnight-UTC row round-trips to the same calendar day in %s',
    async timezone => {
      process.env.TZ = timezone;
      await table.set('show-1', serverShapedShow());

      await table.updateShow('show-1', { name: 'Renamed' });

      expect(lastPayload()).toMatchObject({
        start_date: '2026-11-07',
        end_date: '2026-11-08',
        entry_open_date: '2026-10-01',
        entry_close_date: '2026-10-24',
      });
    }
  );

  it('keeps a cleared entry window null', async () => {
    await table.set('show-1', serverShapedShow());
    await table.updateShow('show-1', { entryOpenDate: '', entryCloseDate: undefined });

    expect(lastPayload()).toMatchObject({ entry_open_date: null, entry_close_date: null });
  });

  it('normalizes a create the same way', async () => {
    process.env.TZ = 'America/Los_Angeles';
    const eveningPick = new Date(2026, 9, 1, 19, 30).toISOString();
    const created = await table.createShow({ ...SERVER_SHAPED_FIELDS, entryOpenDate: eveningPick });
    expect(queueMutation).toHaveBeenCalledWith(
      'INSERT',
      created.id,
      expect.objectContaining({ entry_open_date: '2026-10-01', start_date: '2026-11-07' })
    );
  });

  // Codex P2: a stored non-midnight value (legacy, or written by a path that
  // does not normalize) names its UTC calendar day, the one the entry guards
  // read. An edit that does not touch it must keep that day, not reread it as
  // the local day, which in Los Angeles is a day earlier.
  describe('an untouched stored non-midnight date keeps its UTC day', () => {
    const LEGACY_CLOSE = '2026-10-02T02:30:00+00:00';

    beforeEach(async () => {
      process.env.TZ = 'America/Los_Angeles';
      await table.set('show-1', { ...serverShapedShow(), entryCloseDate: LEGACY_CLOSE });
    });

    it('on an unrelated edit', async () => {
      await table.updateShow('show-1', { name: 'Renamed' });
      expect(lastPayload()).toMatchObject({ entry_close_date: '2026-10-02' });
    });

    it('on a full-row save that re-sends it unchanged, while a changed date is typed', async () => {
      const eveningPick = new Date(2026, 9, 1, 19, 30).toISOString();
      await table.updateShow('show-1', {
        ...SERVER_SHAPED_FIELDS,
        entryOpenDate: eveningPick,
        entryCloseDate: LEGACY_CLOSE,
      });
      expect(lastPayload()).toMatchObject({
        entry_open_date: '2026-10-01',
        entry_close_date: '2026-10-02',
      });
    });

    it('on a conflict rebuild of the edited local row', async () => {
      const eveningPick = new Date(2026, 9, 1, 19, 30).toISOString();
      await table.updateShow('show-1', { entryOpenDate: eveningPick });
      const localRow = await table.get('show-1');
      const rebuild = (
        table as unknown as { rebuildUpdatePayload: (s: ReplicatedShow) => Record<string, unknown> }
      ).rebuildUpdatePayload(localRow as ReplicatedShow);
      expect(rebuild).toMatchObject({
        entry_open_date: '2026-10-01',
        entry_close_date: '2026-10-02',
      });
    });
  });
});
