import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * getEntriesByDog is ONLINE-FIRST, with the local replica as its offline
 * fallback. Entries replicate per-show, so a dog's entries span many scopes and
 * a local result is only ever a lower bound — it can never establish that a dog
 * has no entries. The read reports `verified` so callers can tell an
 * authoritative empty from an unverifiable one (MYK9-121).
 *
 * This file previously asserted the opposite for one case ("does not call
 * online when the local replica already has the dog's entries"). That was the
 * bug: a replica holding one PAST entry is non-empty, so the old
 * `verifyOnlineWhenEmpty` guard never fired, and a caller filtering to
 * "upcoming" derived a confident false empty while fully online.
 *
 * Isolated from entryQueries.replication.test.ts because that file's shared
 * supabase mock doesn't support the `.eq().is().order()` chain
 * postgrestGetEntriesByDog needs — adding it there would touch ~40 unrelated
 * tests' shared fixture.
 */

const { mockEntriesTable, mockDogsTable, mockClassesTable, mockShowsTable, mockTrialsTable } =
  vi.hoisted(() => ({
    mockEntriesTable: { getAll: vi.fn() },
    mockDogsTable: { getAllDogs: vi.fn().mockResolvedValue([]) },
    mockClassesTable: { getAll: vi.fn().mockResolvedValue([]) },
    mockShowsTable: { getAllShows: vi.fn().mockResolvedValue([]) },
    mockTrialsTable: { getAll: vi.fn().mockResolvedValue([]) },
  }));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

const defaultOnlineRow = {
  id: 'entry-online-1',
  dog_id: 'dog-1',
  class: { id: 'c1' },
  show: { id: 's1' },
};
// Mutable so individual tests can model what the SERVER still returns (e.g. a
// row whose delete has not yet synced is still live server-side).
let onlineRows: Array<Record<string, unknown>> = [defaultOnlineRow];
// Set to model the online read being unavailable — offline, or a failed query.
let onlineError: { message: string } | null = null;
let onlineCallCount = 0;

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            order: () => {
              onlineCallCount += 1;
              return Promise.resolve({
                data: onlineError ? null : onlineRows,
                error: onlineError,
              });
            },
          }),
        }),
      }),
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    code: 'UNKNOWN',
  })),
}));

import { getEntriesByDog } from '@/services/database/entries';

function localRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-local-1',
    dogId: 'dog-1',
    classId: null,
    showId: null,
    deletedAt: null,
    entryStatus: 'confirmed',
    ...overrides,
  };
}

describe('getEntriesByDog — online-first with a replica fallback', () => {
  beforeEach(() => {
    onlineRows = [defaultOnlineRow];
    onlineError = null;
    onlineCallCount = 0;
    mockEntriesTable.getAll.mockResolvedValue([]);
  });

  describe('the online read is authoritative', () => {
    it('reads online when the local replica has zero rows for the dog', async () => {
      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
      expect(result.verified).toBe(true);
    });

    // The inversion. A non-empty local replica used to SUPPRESS the online read,
    // which is what let a partial replica masquerade as complete.
    it('still reads online when the local replica already has rows for the dog', async () => {
      mockEntriesTable.getAll.mockResolvedValue([localRow()]);

      const result = await getEntriesByDog('dog-1');

      expect(onlineCallCount).toBe(1);
      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
      expect(result.verified).toBe(true);
    });

    // MYK9-121's actual failure mode, at the read layer: the replica holds one
    // entry from a show that synced, while a second show never did. The old
    // empty-only guard saw a non-empty result and never checked the server, so
    // the unsynced entry stayed invisible — and a caller filtering to "upcoming"
    // rendered "nothing booked" while fully online.
    it('surfaces an entry from an unsynced show that the replica cannot know about', async () => {
      mockEntriesTable.getAll.mockResolvedValue([
        localRow({ id: 'entry-past-synced', showId: 's1' }),
      ]);
      onlineRows = [
        { id: 'entry-past-synced', dog_id: 'dog-1', class: { id: 'c1' }, show: { id: 's1' } },
        { id: 'entry-future-unsynced', dog_id: 'dog-1', class: { id: 'c2' }, show: { id: 's2' } },
      ];

      const result = await getEntriesByDog('dog-1');

      expect(result.data.map(r => (r as Record<string, unknown>).id)).toEqual([
        'entry-past-synced',
        'entry-future-unsynced',
      ]);
      expect(result.verified).toBe(true);
    });
  });

  describe('pending local deletes still win over the server', () => {
    it('does not resurrect a locally-tombstoned entry the server still returns as live', async () => {
      // A queued soft-delete not yet synced. The server has not seen the delete,
      // so it still returns the row as live — it must NOT reappear.
      mockEntriesTable.getAll.mockResolvedValue([
        localRow({ id: 'entry-tombstoned', deletedAt: '2026-07-09T00:00:00.000Z' }),
      ]);
      onlineRows = [
        { id: 'entry-tombstoned', dog_id: 'dog-1', class: { id: 'c1' }, show: { id: 's1' } },
      ];

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(0);
      expect(result.verified).toBe(true);
    });

    it('surfaces a live entry in another show while excluding a locally-tombstoned one', async () => {
      mockEntriesTable.getAll.mockResolvedValue([
        localRow({ id: 'entry-tombstoned', showId: 's1', deletedAt: '2026-07-09T00:00:00.000Z' }),
      ]);
      onlineRows = [
        { id: 'entry-tombstoned', dog_id: 'dog-1', class: { id: 'c1' }, show: { id: 's1' } },
        { id: 'entry-live-other-show', dog_id: 'dog-1', class: { id: 'c2' }, show: { id: 's2' } },
      ];

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('entry-live-other-show');
    });
  });

  describe('unsynced local writes survive an authoritative read', () => {
    // Online-first must not mean server-only. An entry created offline is not on
    // the server yet, so a successful online read omits it — returning only
    // server rows would make the user's own just-created entry vanish.
    it('keeps a pending local entry the server has never seen', async () => {
      mockEntriesTable.getAll.mockResolvedValue([
        localRow({ id: 'entry-created-offline', _syncStatus: 'pending' }),
      ]);
      onlineRows = [defaultOnlineRow];

      const result = await getEntriesByDog('dog-1');

      expect(result.data.map(r => (r as Record<string, unknown>).id)).toEqual([
        'entry-online-1',
        'entry-created-offline',
      ]);
    });

    it('keeps a pending local entry even when the server returns nothing', async () => {
      mockEntriesTable.getAll.mockResolvedValue([
        localRow({ id: 'entry-created-offline', _syncStatus: 'pending' }),
      ]);
      onlineRows = [];

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('entry-created-offline');
    });

    // Mirrors ReplicatedEntriesTable.resolveConflict: a pending local row wins
    // over the server copy, so an unsynced edit does not read as reverted.
    it('prefers the pending local copy of a row the server also has', async () => {
      mockEntriesTable.getAll.mockResolvedValue([
        localRow({ id: 'entry-online-1', _syncStatus: 'pending', entryStatus: 'scratched' }),
      ]);

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).entry_status).toBe('scratched');
    });

    // The lookup caches here are empty (see the mocks), so the replica maps
    // class/show to null — exactly the cold-cache case. Swapping the whole row
    // would drop the server's joins, and deriveDogActivity classifies on
    // show.start_date, so the entry would fall out of "upcoming": a false empty
    // produced by the read that exists to prevent one.
    it('keeps the server joins when overlaying a pending row onto it', async () => {
      mockEntriesTable.getAll.mockResolvedValue([
        localRow({ id: 'entry-online-1', _syncStatus: 'pending', entryStatus: 'scratched' }),
      ]);
      onlineRows = [
        {
          id: 'entry-online-1',
          dog_id: 'dog-1',
          class: { id: 'c1', name: 'Container Novice A' },
          show: { id: 's1', name: 'Heartland', start_date: '2099-08-01' },
        },
      ];

      const result = await getEntriesByDog('dog-1');

      const row = result.data[0] as Record<string, Record<string, unknown>>;
      expect(row.show?.start_date).toBe('2099-08-01');
      expect(row.class?.name).toBe('Container Novice A');
      // ...while the unsynced local edit still wins on the fields it owns.
      expect((row as unknown as Record<string, unknown>).entry_status).toBe('scratched');
    });

    // A local row that is NOT pending and absent from the server was deleted or
    // moved server-side. Re-adding it would be the tombstone bug in reverse.
    it('does not re-add a synced local row the server no longer returns', async () => {
      mockEntriesTable.getAll.mockResolvedValue([localRow({ id: 'entry-removed-elsewhere' })]);
      onlineRows = [];

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(0);
      expect(result.verified).toBe(true);
    });
  });

  describe('the replica being unavailable does not block the online read', () => {
    it('still returns authoritative rows when local storage throws', async () => {
      mockEntriesTable.getAll.mockRejectedValue(new Error('IndexedDB unavailable'));

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('entry-online-1');
      expect(result.verified).toBe(true);
    });

    it('reports an unverified empty when BOTH the replica and the online read fail', async () => {
      mockEntriesTable.getAll.mockRejectedValue(new Error('IndexedDB unavailable'));
      onlineError = { message: 'network down' };

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(0);
      expect(result.verified).toBe(false);
    });
  });

  describe('offline falls back to the replica, and says so', () => {
    it('serves replica rows when the online read fails', async () => {
      onlineError = { message: 'network down' };
      mockEntriesTable.getAll.mockResolvedValue([localRow()]);

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('entry-local-1');
      expect(result.error).toBeNull();
    });

    // The whole point of the flag: an offline empty is NOT evidence of an empty
    // calendar, because the replica cannot see shows that never synced.
    it('marks a failed read unverified so callers cannot present it as fact', async () => {
      onlineError = { message: 'network down' };

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(0);
      expect(result.verified).toBe(false);
    });

    it('marks a non-empty offline result unverified too — it is only a lower bound', async () => {
      onlineError = { message: 'network down' };
      mockEntriesTable.getAll.mockResolvedValue([localRow()]);

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      expect(result.verified).toBe(false);
    });
  });
});
