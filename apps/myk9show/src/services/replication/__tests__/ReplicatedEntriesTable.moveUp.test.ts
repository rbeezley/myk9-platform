/**
 * MYK9-640 round 3: the reverse must be observably complete on the device that
 * performs it.
 *
 * `reverse_move_up_entry` soft-deletes the destination server-side, and
 * `hydrateMovedPair` then re-reads the pair through
 * `view_authenticated_entry_results_replication` — whose row gate is
 * `deleted_at IS NULL OR is_own_entry`. For a secretary who does not own the
 * dog, the destination is simply NOT RETURNED, so the stale clean copy stayed in
 * the local store forever: the dog showed live in BOTH classes on the very
 * device that pressed Move back, and nothing could remove it (this table sets no
 * `shouldCleanupStaleRows`, and an incremental fetch can never emit a row the
 * view hides).
 *
 * `origin/main`'s undo wrote the tombstone through `updateEntry`; the RPC
 * rewrite dropped it. This pins that it is back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from '../ReplicatedEntriesTable';
import { supabase } from '@/services/database/supabaseClient';

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe('reverseMoveUpEntryViaRpc (MYK9-640)', () => {
  let table: ReplicatedEntriesTable;

  const seed = (id: string, data: ReplicatedEntry) =>
    table.set(id, data, false, undefined, undefined, {
      allowColdInsert: 'test fixture standing in for the sync download',
    });

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    vi.mocked(supabase.from).mockReset();
    vi.mocked(supabase.rpc).mockReset();
    table = new ReplicatedEntriesTable();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  /** The read-back the view performs: the tombstoned destination is invisible. */
  function mockReadBackWithoutTheDestination() {
    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    id: 'source-1',
                    class_id: 'class-novice',
                    show_id: 'show-1',
                    entry_status: 'confirmed',
                    check_in_status: 'checked-in',
                    version: 4,
                  },
                ],
                error: null,
              }),
          }),
        }) as never
    );
  }

  it('removes the destination from the LOCAL replica, which the read-back cannot do', async () => {
    await seed('source-1', {
      id: 'source-1',
      classId: 'class-novice',
      showId: 'show-1',
      entryStatus: 'moved',
    });
    await seed('dest-1', {
      id: 'dest-1',
      classId: 'class-advanced',
      showId: 'show-1',
      entryStatus: 'confirmed',
      movedFromEntryId: 'source-1',
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'source-1', error: null } as never);
    mockReadBackWithoutTheDestination();

    await table.reverseMoveUpEntryViaRpc('dest-1');

    // The dog is in ONE class on this device, not two.
    expect(await table.get('dest-1')).toBeNull();
    expect(await table.getEntriesByClass('class-advanced')).toEqual([]);
    const restored = await table.get('source-1');
    expect(restored?.entryStatus).toBe('confirmed');
  });

  it('does not let the read-back resurrect the destination for an OWNER', async () => {
    // The view's gate is `deleted_at IS NULL OR is_own_entry`, so a manager who
    // also owns or handles the dog — a small-club secretary moving their own
    // dog up — gets the soft-deleted destination BACK from it. Re-`set`ting it
    // put the row this method had just deleted straight back in, live, with
    // `confirmed` intact and counting toward the target class's capacity. The
    // fix is not to filter the read-back: it is to stop asking it to carry a
    // removal at all, and hydrate the SOURCE only.
    await seed('source-1', {
      id: 'source-1',
      classId: 'class-novice',
      showId: 'show-1',
      entryStatus: 'moved',
    });
    await seed('dest-1', {
      id: 'dest-1',
      classId: 'class-advanced',
      showId: 'show-1',
      entryStatus: 'confirmed',
      movedFromEntryId: 'source-1',
    });

    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'source-1', error: null } as never);
    const requestedIds: string[][] = [];
    vi.mocked(supabase.from).mockImplementation(
      () =>
        ({
          select: () => ({
            in: (_column: string, ids: string[]) => {
              requestedIds.push(ids);
              // The stub answers only what was asked for, as PostgREST does,
              // and includes the tombstone as an OWNER's read really would.
              const rows = [
                {
                  id: 'source-1',
                  class_id: 'class-novice',
                  show_id: 'show-1',
                  entry_status: 'confirmed',
                  version: 4,
                },
                // What an owner's read really returns.
                {
                  id: 'dest-1',
                  class_id: 'class-advanced',
                  show_id: 'show-1',
                  entry_status: 'confirmed',
                  deleted_at: '2026-09-18T00:00:00Z',
                  version: 3,
                },
              ].filter(row => ids.includes(row.id));
              return Promise.resolve({ data: rows, error: null });
            },
          }),
        }) as never
    );

    await table.reverseMoveUpEntryViaRpc('dest-1');

    // The destination is never even ASKED for.
    expect(requestedIds).toEqual([['source-1']]);
    expect(await table.get('dest-1')).toBeNull();
    expect(await table.getEntriesByClass('class-advanced')).toEqual([]);
  });

  it('leaves the local store alone when the server refuses', async () => {
    await seed('dest-1', {
      id: 'dest-1',
      classId: 'class-advanced',
      showId: 'show-1',
      entryStatus: 'confirmed',
      movedFromEntryId: 'source-1',
    });

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '22023', message: 'This run has already started.' },
    } as never);

    await expect(table.reverseMoveUpEntryViaRpc('dest-1')).rejects.toThrow(/already started/);

    // Nothing was written, so the dog is still exactly where the server has them.
    expect(await table.get('dest-1')).not.toBeNull();
  });
});
