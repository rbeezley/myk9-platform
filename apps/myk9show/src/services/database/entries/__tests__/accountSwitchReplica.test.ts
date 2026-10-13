// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

/**
 * MYK9-1133 step 1: entries replica reads after an account switch.
 *
 * A shared browser where account A (secretary of show-y) synced the entries
 * replica, signed out (MYK9-202 keeps the replica), and account B signed in.
 * B is NOT authorized for show-y: `entries_select` returns B no row of it, so
 * the server mock below answers [] for B, and A's rows for A.
 *
 * The replica below is what A's sync left: A's two show-y entries, a show-y
 * sync-metadata row (`totalRows`, which is per SHOW, not per account), and no
 * dirty rows. The signed-in account never reaches the replica tables, so the
 * only thing that can keep A's rows from B is a read that asks the server or
 * filters by account.
 *
 * `sync` is a stand-in that resolves success and leaves the replica as it is.
 * That models the real engine: B's incremental sync of show-y downloads
 * nothing, and stale-row cleanup runs only on a forced full sync after an
 * independently proven empty scope (packages/replication syncReplicatedTable
 * `scopeEmptyIsProven`, MYK9-880), which a non-manager cannot supply.
 *
 * The replica carries the account stamp the sync writes: show-y's scope was
 * synced by `user-a`, and `getCurrentAuthUserId` answers for whoever is signed
 * in (null when unresolved). Each read must hand B nothing of A's, sending B
 * to the server online and returning an error, never A's rows or an empty
 * list, offline. A reading its own stamped show offline is unchanged. Each
 * case has a positive control: the same read as A returns exactly A's ids, so
 * a mis-seeded replica cannot pass for the wrong reason.
 */

const ENTRY_A1 = {
  id: 'entry-a1',
  showId: 'show-y',
  classId: 'class-y',
  dogId: 'dog-a',
  handlerId: null,
  armband: '101',
  handler: 'Alice Handler',
  deletedAt: null,
  entryStatus: 'confirmed',
  runOrder: 1,
  createdAt: '2026-10-01T10:00:00.000Z',
};
const ENTRY_A2 = {
  ...ENTRY_A1,
  id: 'entry-a2',
  armband: '102',
  runOrder: 2,
  createdAt: '2026-10-01T11:00:00.000Z',
};
const A_IDS = ['entry-a1', 'entry-a2'];

const { state, mockEntriesTable } = vi.hoisted(() => ({
  state: {
    user: 'A' as 'A' | 'B' | null,
    offline: false,
    // Who the show-y scope is stamped as synced by; undefined is a legacy cache.
    stampedBy: 'user-a' as string | undefined,
    replica: [] as Array<Record<string, unknown>>,
  },
  mockEntriesTable: {
    getEntriesByShow: vi.fn(),
    getEntriesByClass: vi.fn(),
    getAll: vi.fn(),
    getAllOrThrow: vi.fn(),
    getEntryById: vi.fn(),
    getSyncMetadata: vi.fn(),
    getCurrentAuthUserId: vi.fn(),
    getReplicatedRow: vi.fn(),
    hasPendingWritesForShow: vi.fn(),
    sync: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: vi.fn(async () => [
      { id: 'dog-a', name: 'Ajax', callName: 'Ajax', breed: 'Border Collie', ownerId: 'person-a' },
    ]),
    getDogById: vi.fn(async () => null),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getAll: vi.fn(async () => [{ id: 'class-y', name: 'Interior 1', trialId: 'trial-y' }]),
    getAllOrThrow: vi.fn(async () => [{ id: 'class-y', name: 'Interior 1', trialId: 'trial-y' }]),
    getClassById: vi.fn(async () => null),
    getClassesByTrial: vi.fn(async (trialId: string) =>
      trialId === 'trial-y' ? [{ id: 'class-y', name: 'Interior 1', trialId: 'trial-y' }] : []
    ),
  },
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: {
    getAllShows: vi.fn(async () => []),
    getShowById: vi.fn(async () => null),
  },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn(async () => []), getAll: vi.fn(async () => []) },
}));
vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: { getByShow: vi.fn(async () => []) },
}));
vi.mock('@/services/database/entries/handlerHydration', () => ({
  loadHandlerPeople: vi.fn(async () => new Map()),
}));

/**
 * A PostgREST stand-in that answers as RLS does: B gets nothing for show-y,
 * A gets A's rows. Every chained filter method returns the chain; awaiting it
 * (or `.range()`) resolves the rows.
 */
vi.mock('@/services/database/supabaseClient', () => {
  const serverRows = (table: string) =>
    state.user === 'A' && (table === 'entries' || table === 'view_authenticated_entry_results')
      ? [
          { id: 'entry-a1', armband: '101', handler: 'Alice Handler', class: { id: 'class-y' } },
          { id: 'entry-a2', armband: '102', handler: 'Alice Handler', class: { id: 'class-y' } },
        ]
      : [];
  return {
    supabase: {
      rpc: async () => {
        if (state.offline) throw new TypeError('Failed to fetch');
        return { data: state.user === 'A' ? 2 : 0, error: null };
      },
      from: (table: string) => ({
        select: () => {
          const chain: Record<string, unknown> = {};
          for (const method of ['eq', 'in', 'is', 'or', 'order', 'ilike', 'lt', 'gt', 'limit']) {
            chain[method] = () => chain;
          }
          const result = () =>
            state.offline
              ? Promise.reject(new TypeError('Failed to fetch'))
              : Promise.resolve({
                  data: serverRows(table),
                  error: null,
                  count: serverRows(table).length,
                });
          chain.range = () => result();
          chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
          chain.single = () => Promise.resolve({ data: null, error: null });
          chain.then = (
            resolve: (value: unknown) => unknown,
            reject: (reason: unknown) => unknown
          ) => result().then(resolve, reject);
          return chain;
        },
      }),
    },
    logQuery: vi.fn(),
    createDatabaseError,
  };
});

import {
  getAllEntries,
  getEntriesByClass,
  getEntriesByShow,
  getEntriesByShowFromReplication,
  getEntriesByTrial,
  getEntriesForShow,
  searchEntries,
} from '@/services/database/entries';

function ids(result: { data: unknown }): string[] {
  return ((result.data ?? []) as Array<{ id: string }>).map(row => row.id).sort();
}

const CURRENT_USER_ID = { A: 'user-a', B: 'user-b' } as const;

/**
 * Rows are kept per account (MYK9-1133), so the real table hands a reader only
 * rows it wrote. This stand-in models that: the replica's rows are owned by the
 * account that stamped the show (none, for a pre-ownership cache), and a reader
 * sees them only when it is that account.
 */
function visibleReplica() {
  const current = state.user ? CURRENT_USER_ID[state.user] : null;
  return state.stampedBy !== undefined && state.stampedBy === current ? state.replica : [];
}

beforeEach(() => {
  state.user = 'A';
  state.offline = false;
  state.stampedBy = 'user-a';
  state.replica = [ENTRY_A1, ENTRY_A2];

  mockEntriesTable.getEntriesByShow.mockReset();
  mockEntriesTable.getEntriesByShow.mockImplementation(async (showId: string) =>
    visibleReplica().filter(row => row.showId === showId)
  );
  mockEntriesTable.getEntriesByClass.mockReset();
  mockEntriesTable.getEntriesByClass.mockImplementation(async (classId: string) =>
    visibleReplica().filter(row => row.classId === classId)
  );
  for (const read of [mockEntriesTable.getAll, mockEntriesTable.getAllOrThrow]) {
    read.mockReset();
    read.mockImplementation(async () => [...visibleReplica()]);
  }
  mockEntriesTable.getEntryById.mockReset();
  mockEntriesTable.getEntryById.mockImplementation(
    async (id: string) => visibleReplica().find(row => row.id === id) ?? null
  );
  // show-y completed a sync on this device, as the account in `stampedBy`.
  mockEntriesTable.getSyncMetadata.mockReset();
  mockEntriesTable.getSyncMetadata.mockImplementation(async (showId?: string) =>
    showId === 'show-y'
      ? {
          tableName: 'entries',
          totalRows: 2,
          ...(state.stampedBy ? { syncedByAuthUserId: state.stampedBy } : {}),
        }
      : null
  );
  // Null while unresolved (signed out, or an expired session offline).
  mockEntriesTable.getCurrentAuthUserId.mockReset();
  mockEntriesTable.getCurrentAuthUserId.mockImplementation(async () =>
    state.user ? CURRENT_USER_ID[state.user] : null
  );
  mockEntriesTable.getReplicatedRow.mockReset();
  mockEntriesTable.getReplicatedRow.mockImplementation(async (id: string) => ({
    id,
    isDirty: false,
  }));
  mockEntriesTable.hasPendingWritesForShow.mockReset();
  mockEntriesTable.hasPendingWritesForShow.mockResolvedValue(false);
  // The refresh sync resolves success and, in this stand-in, does not restamp:
  // the engine's own stamping and cleanup are pinned in packages/replication.
  mockEntriesTable.sync.mockReset();
  mockEntriesTable.sync.mockResolvedValue({ tableName: 'entries', success: true });
});

/** One read per row. The case and its control run the identical call. */
const READS: Array<[string, () => Promise<{ data: unknown; error?: unknown }>]> = [
  ['getEntriesForShow (secretary roster)', () => getEntriesForShow('show-y')],
  ['getEntriesByShow', () => getEntriesByShow('show-y')],
  ['getEntriesByShowFromReplication', () => getEntriesByShowFromReplication('show-y')],
  ['getEntriesByTrial', () => getEntriesByTrial('trial-y')],
  ['getEntriesByClass', () => getEntriesByClass('class-y')],
  ['getAllEntries (no scope)', () => getAllEntries()],
  ['searchEntries (armband 10)', () => searchEntries('10')],
];

describe('entries replica after an account switch (MYK9-1133)', () => {
  describe('positive control: account A reads its own stamped show-y rows', () => {
    it.each(READS)('%s returns A rows to A', async (_name, read) => {
      expect(ids(await read())).toEqual(A_IDS);
    });

    it.each(READS)('%s still returns A rows to A offline', async (_name, read) => {
      state.offline = true;
      const result = await read();
      expect(result.error ?? null).toBeNull();
      expect(ids(result)).toEqual(A_IDS);
    });
  });

  describe("B is refused show-y by RLS, so A's rows must not reach B", () => {
    it.each(READS)('%s: B must not see A rows (online)', async (_name, read) => {
      state.user = 'B';
      expect(ids(await read())).toEqual([]);
    });

    // Offline B holds A's stamped replica and the server cannot be asked. The
    // scoped reads fail loudly; the unscoped list and search hold nothing of B's.
    it.each(READS.slice(0, 5))(
      '%s: offline, B gets an error, never A rows or an empty list',
      async (_name, read) => {
        state.user = 'B';
        state.offline = true;
        const result = await read();
        expect(ids(result)).toEqual([]);
        expect(result.error ?? null).not.toBeNull();
      }
    );

    it.each(READS.slice(5))('%s: offline, B sees none of A rows', async (_name, read) => {
      state.user = 'B';
      state.offline = true;
      expect(ids(await read())).toEqual([]);
    });
  });

  describe('a scope that is not stamped as this account', () => {
    it.each(READS.slice(0, 5))(
      '%s: a pre-change cache (no stamp) is cold, even for A, and A is sent to the server',
      async (_name, read) => {
        state.stampedBy = undefined;
        expect(ids(await read())).toEqual(A_IDS);
        // Cold means "ask the server": offline there is no answer, and it is an error.
        state.offline = true;
        const offline = await read();
        expect(ids(offline)).toEqual([]);
        expect(offline.error ?? null).not.toBeNull();
      }
    );

    it('an unresolved account matches no stamp, for A or anyone', async () => {
      state.user = null;
      state.offline = true;
      const result = await getEntriesByClass('class-y');
      expect(ids(result)).toEqual([]);
      expect(result.error ?? null).not.toBeNull();
    });

    it('an unreadable sync-metadata read fails closed: A is sent to the server, offline it is an error', async () => {
      mockEntriesTable.getSyncMetadata.mockRejectedValue(new Error('IndexedDB timed out'));
      expect(ids(await getEntriesByClass('class-y'))).toEqual(A_IDS);

      state.offline = true;
      // The account's own rows may ride along, but the read says it is unverified.
      expect((await getEntriesByClass('class-y')).error ?? null).not.toBeNull();
      const roster = await getEntriesForShow('show-y');
      expect(ids(roster)).toEqual([]);
      expect(roster.error ?? null).not.toBeNull();
    });

    it('A, then B, then A: B restamps the show, and A reads cold until A syncs again', async () => {
      // B signs in and syncs show-y: its stand-in sync leaves B's stamp (and
      // none of A's rows, as the engine's purge guarantees).
      state.user = 'B';
      state.replica = [];
      state.stampedBy = 'user-b';
      expect(ids(await getEntriesByClass('class-y'))).toEqual([]);

      // A signs back in: the show is stamped as B's, so A's offline read is an
      // error rather than B's rows, and online it comes from the server.
      state.user = 'A';
      state.replica = [{ ...ENTRY_A1, id: 'entry-b-left-behind' }];
      expect(ids(await getEntriesByClass('class-y'))).toEqual(A_IDS);
      state.offline = true;
      const offline = await getEntriesByClass('class-y');
      expect(ids(offline)).toEqual([]);
      expect(offline.error ?? null).not.toBeNull();
    });
  });
});
