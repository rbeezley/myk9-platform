/**
 * A show soft-deleted on the server must leave the local shows replica.
 *
 * The incremental fetch is live-only (`deleted_at is null`), so a deletion is
 * never delivered as a row. Without the coverage count + stale cleanup the
 * deleted show stayed in IndexedDB, and in every list reading it, forever.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { ReplicatedShowsTable, type ReplicatedShow } from '../ReplicatedShowsTable';

const server = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  liveCount: 0,
  rpc: vi.fn(),
}));

vi.mock('@/services/database/supabaseClient', () => {
  const builder = (mode: 'rows' | 'count') => {
    const b: Record<string, unknown> = {};
    for (const m of ['is', 'gt', 'order', 'eq']) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve(
        mode === 'count'
          ? { count: server.liveCount, data: null, error: null }
          : { data: server.rows, error: null }
      );
    return b;
  };
  return {
    supabase: {
      rpc: server.rpc,
      from: () => ({
        select: (_cols: string, opts?: { head?: boolean }) =>
          builder(opts?.head ? 'count' : 'rows'),
      }),
    },
  };
});

vi.mock('@myk9/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@myk9/core')>();
  return {
    ...actual,
    logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  };
});

const show = (id: string): ReplicatedShow => ({
  id,
  name: id,
  organization: 'AKC',
  startDate: '2026-10-01',
  endDate: '2026-10-02',
  location: 'Fairgrounds',
  status: 'published',
  clubId: 'club-1',
});

const serverRow = (id: string) =>
  fromAny({
    id,
    name: id,
    organization: 'AKC',
    start_date: '2026-10-01',
    end_date: '2026-10-02',
    location: 'Fairgrounds',
    status: 'published',
    club_id: 'club-1',
    updated_at: '2026-10-01T00:00:00.000Z',
    deleted_at: null,
  }) as Record<string, unknown>;

describe('ReplicatedShowsTable sync of a show deleted on the server', () => {
  let table: ReplicatedShowsTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedShowsTable();
    server.rows = [];
    server.liveCount = 0;
    server.rpc.mockReset();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('removes the deleted show from the replica on the next sync and keeps the live one', async () => {
    await table.set('live-show', show('live-show'));
    await table.set('deleted-show', show('deleted-show'));
    // The server now serves only the live show (the other is soft-deleted).
    server.rows = [serverRow('live-show')];
    server.liveCount = 1;

    await table.sync('');

    expect(await table.get('deleted-show')).toBeNull();
    expect(await table.get('live-show')).not.toBeNull();
  });

  describe('when the last show of the scope is deleted elsewhere (count 0, fetch 0)', () => {
    beforeEach(async () => {
      await table.set('deleted-a', show('deleted-a'));
      await table.set('deleted-b', show('deleted-b'));
      server.rows = [];
      server.liveCount = 0;
      // Stale cleanup spares rows synced at or after the fetch start; real
      // replica rows are older than the sync, so let the clock move on.
      await new Promise(resolve => setTimeout(resolve, 5));
      // Local-only create, not on the server: never part of the proof.
      await table.set('draft-local', { ...show('draft-local'), _localOnly: true }, true);
    });

    it('clears the replica once the independent liveness read confirms every show is deleted', async () => {
      server.rpc.mockResolvedValue({
        data: [
          { show_id: 'deleted-a', is_live: false },
          { show_id: 'deleted-b', is_live: false },
        ],
        error: null,
      });

      await table.sync('');

      expect(server.rpc).toHaveBeenCalledWith('get_manageable_show_liveness', {
        p_show_ids: expect.arrayContaining(['deleted-a', 'deleted-b']),
      });
      expect(await table.get('deleted-a')).toBeNull();
      expect(await table.get('deleted-b')).toBeNull();
      expect(await table.get('draft-local')).not.toBeNull();
    });

    it.each([
      ['the liveness read errors', { data: null, error: { message: 'boom' } }],
      [
        'a show is still live',
        {
          data: [
            { show_id: 'deleted-a', is_live: false },
            { show_id: 'deleted-b', is_live: true },
          ],
          error: null,
        },
      ],
      [
        'a show is missing from the answer (not manageable)',
        { data: [{ show_id: 'deleted-a', is_live: false }], error: null },
      ],
    ])('keeps every row when %s', async (_name, response) => {
      server.rpc.mockResolvedValue(response);

      await table.sync('');

      expect(await table.get('deleted-a')).not.toBeNull();
      expect(await table.get('deleted-b')).not.toBeNull();
    });
  });
});
