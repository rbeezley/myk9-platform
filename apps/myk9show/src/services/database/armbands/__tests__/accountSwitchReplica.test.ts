// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

/**
 * MYK9-1133 step 1: armband reads after an account switch.
 *
 * Account A (secretary of show-y) synced the armbands, dogs and entries
 * replicas and signed out (MYK9-202 keeps them). Account B, who RLS does not
 * let read show-y, signs in. The server mock answers as RLS does for B (no
 * armband, no entry, no person of show-y) and as it does for A otherwise.
 *
 * Both reads here are replica-first with PostgREST only on a THROW
 * (`withReplicationFallback`), so a warm replica never asks the server.
 *
 * - lookupDogByArmband: LEAK if B is handed A's dog, entries and handler.
 * - getArmbandCountForShow (the armbands `getByShow` read exposed by this
 *   module): a count of A's armbands, not a row leak; pinned the same way.
 *
 * Leaks are pinned with `it.fails`; each has a positive control (the same call
 * as A returns A's data) so a mis-seeded replica cannot pass for the wrong
 * reason.
 */

const { state } = vi.hoisted(() => ({
  state: {
    user: 'A' as 'A' | 'B' | null,
    offline: false,
    // Armbands sync every show at once (MYK9-1300): the table-level stamp is
    // the account that completed the download (undefined: a pre-change cache).
    tableStampedBy: 'user-a' as string | undefined,
    tableSynced: true,
    // A per-show slot left by the per-show sync armbands had before MYK9-1300.
    staleScopeStampedBy: undefined as string | undefined,
  },
}));

const ARMBAND_A = {
  id: 'armband-a1',
  showId: 'show-y',
  dogId: 'dog-a',
  armbandNumber: '101',
  isAvailable: false,
};
const ARMBAND_A2 = { ...ARMBAND_A, id: 'armband-a2', dogId: 'dog-a2', armbandNumber: '102' };
const DOG_A = {
  id: 'dog-a',
  name: 'Ajax',
  callName: 'Ajax',
  breed: 'Border Collie',
  sex: 'male',
  ownerId: 'person-a',
};
const ENTRY_A = {
  id: 'entry-a1',
  showId: 'show-y',
  classId: 'class-y',
  dogId: 'dog-a',
  entryStatus: 'confirmed',
  handler: 'Alice Handler',
};

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: {
    getByShow: vi.fn(async (showId: string) =>
      [ARMBAND_A, ARMBAND_A2].filter(armband => armband.showId === showId)
    ),
    getSyncMetadata: vi.fn(async (scopeValue?: string) => {
      if (scopeValue === undefined) {
        return state.tableSynced
          ? {
              tableName: 'armbands',
              totalRows: 2,
              ...(state.tableStampedBy ? { syncedByAuthUserId: state.tableStampedBy } : {}),
            }
          : null;
      }
      return scopeValue === 'show-y' && state.staleScopeStampedBy
        ? { tableName: 'armbands', totalRows: 2, syncedByAuthUserId: state.staleScopeStampedBy }
        : null;
    }),
    getCurrentAuthUserId: vi.fn(async () =>
      state.user ? (state.user === 'A' ? 'user-a' : 'user-b') : null
    ),
    lookupByArmbandNumber: vi.fn(async (showId: string, number: string) =>
      [ARMBAND_A, ARMBAND_A2].find(a => a.showId === showId && a.armbandNumber === number)
    ),
  },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getDogById: vi.fn(async (id: string) => (id === DOG_A.id ? DOG_A : null)),
  },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(async (showId: string) => (showId === 'show-y' ? [ENTRY_A] : [])),
  },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassById: vi.fn(async () => ({ id: 'class-y', name: 'Interior 1', level: 'Novice' })),
  },
}));

/** RLS stand-in: B reads nothing of show-y; the owner label read answers for A only. */
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const chain: Record<string, unknown> = {};
        const fail = () => Promise.reject(new TypeError('Failed to fetch'));
        for (const method of ['eq', 'in', 'is', 'or', 'order', 'limit']) {
          chain[method] = () => chain;
        }
        const rows = () =>
          state.user === 'A' && table === 'people'
            ? { first_name: 'Alice', last_name: 'Owner' }
            : null;
        chain.maybeSingle = () =>
          state.offline ? fail() : Promise.resolve({ data: rows(), error: null });
        chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          (state.offline ? fail() : Promise.resolve({ data: [], error: null, count: 0 })).then(
            resolve,
            reject
          );
        return chain;
      },
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));

import { getArmbandCountForShow, lookupDogByArmband } from '@/services/database/armbands';

beforeEach(() => {
  state.user = 'A';
  state.offline = false;
  state.tableStampedBy = 'user-a';
  state.tableSynced = true;
  state.staleScopeStampedBy = undefined;
});

describe('armbands replica after an account switch (MYK9-1133)', () => {
  describe('positive control: account A reads its own stamped show-y armbands', () => {
    // The owner label is always a PostgREST read (people is not replicated), so
    // this lookup already fails offline today; only the online case is pinned.
    it('lookupDogByArmband returns A dog and entry ids to A', async () => {
      const { data, error } = await lookupDogByArmband('show-y', '101');
      expect(error).toBeNull();
      expect(data?.dog.id).toBe('dog-a');
      expect(data?.entries.map(entry => entry.id)).toEqual(['entry-a1']);
    });

    it('getArmbandCountForShow counts A armbands for A, online and offline', async () => {
      for (const offline of [false, true]) {
        state.offline = offline;
        const { count, error } = await getArmbandCountForShow('show-y');
        expect(error).toBeNull();
        expect(count).toBe(2);
      }
    });
  });

  it('lookupDogByArmband: B must not see A rows', async () => {
    state.user = 'B';
    const { data } = await lookupDogByArmband('show-y', '101');
    expect(data).toBeNull();
  });

  it('getArmbandCountForShow: B must not see A rows', async () => {
    state.user = 'B';
    const { count, error } = await getArmbandCountForShow('show-y');
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('offline, B gets an error from both reads, never A rows or a zero', async () => {
    state.user = 'B';
    state.offline = true;
    const lookup = await lookupDogByArmband('show-y', '101');
    expect(lookup.data).toBeNull();
    expect(lookup.error).not.toBeNull();
    const count = await getArmbandCountForShow('show-y');
    expect(count.count).toBe(0);
    expect(count.error).not.toBeNull();
  });

  it('a pre-change cache (no stamp) is cold: the server answers online, an error offline', async () => {
    state.tableStampedBy = undefined;
    expect((await getArmbandCountForShow('show-y')).count).toBe(0);
    state.offline = true;
    expect((await getArmbandCountForShow('show-y')).error).not.toBeNull();
  });

  it('an unresolved account matches no stamp', async () => {
    state.user = null;
    state.offline = true;
    expect((await getArmbandCountForShow('show-y')).error).not.toBeNull();
  });

  describe('a per-show slot from before MYK9-1300', () => {
    it("is ignored: the account's own all-shows download is read offline", async () => {
      state.staleScopeStampedBy = 'user-b';
      state.offline = true;
      expect(await getArmbandCountForShow('show-y')).toEqual({ count: 2, error: null });
    });

    it("cannot vouch for another account's all-shows download", async () => {
      state.staleScopeStampedBy = 'user-b';
      state.user = 'B';
      state.offline = true;
      expect((await getArmbandCountForShow('show-y')).error).not.toBeNull();
    });
  });

  it('nothing synced at all is the unchanged cold path', async () => {
    state.tableSynced = false;
    state.user = 'B';
    state.offline = true;
    expect(await getArmbandCountForShow('show-y')).toEqual({ count: 2, error: null });
  });
});
