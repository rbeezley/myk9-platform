// @vitest-environment node
/**
 * MYK9-1142: the ringside screens read the entries replica straight from
 * `replicatedEntriesTable`, not through the `services/database` reads that
 * MYK9-1133 made refuse another account's rows.
 *
 * This runs the at-show reads against the REAL IndexedDB-backed singleton, with
 * a replica account A synced (rows owned by `user-a`, the show stamped as A's)
 * and account B signed in on the same device (MYK9-202 keeps the replica on
 * sign-out). The engine's read funnel (`ReplicatedTable.visibleRows`) is what
 * narrows each read, so every at-show read below is proven to hand B nothing of
 * A's, and A its own rows offline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';
import { hasShowEntriesSynced } from '@/services/replication/entriesShowSyncState';
import { fetchAtShowClassList } from './atShowClassListAdapter';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getTrialsByShow: vi.fn(async () => [{ id: 'trial-y' }]) },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(async () => [{ id: 'class-y', classOrder: 1, classStatus: 'none' }]),
  },
}));
vi.mock('@/features/show-today/accountTodayEntries.helpers', () => ({
  getFavoriteClassIdsForTrial: () => new Set<string>(),
}));

const SHOW = 'show-y';
const CLASS = 'class-y';

function entry(id: string): ReplicatedEntry {
  return {
    id,
    showId: SHOW,
    classId: CLASS,
    dogId: `dog-${id}`,
    entryStatus: 'confirmed',
  } as ReplicatedEntry;
}

async function resetReplica() {
  const { databaseManager } = await import('@myk9/replication');
  await databaseManager.reset();
  await replicatedEntriesTable.clearCache();
}

function signInAs(authUserId: string | null) {
  vi.spyOn(replicatedEntriesTable, 'getCurrentAuthUserId').mockResolvedValue(authUserId);
}

const ids = (rows: Array<{ id: string }>) => rows.map(row => row.id).sort();

describe('at-show entries reads after an account switch (MYK9-1142)', () => {
  beforeEach(async () => {
    await resetReplica();
    // Account A's sync: its rows, owned by A, and the show stamped as A's.
    signInAs('user-a');
    await replicatedEntriesTable.batchSet([entry('a1'), entry('a2')], undefined, 'user-a');
    await replicatedEntriesTable.updateSyncMetadata(
      { totalRows: 2 },
      { scopeValue: SHOW, scopeSyncedBy: 'user-a' }
    );
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetReplica();
  });

  describe('positive control: A reads its own rows (offline, nothing mocked but identity)', () => {
    it('the engine reads the at-show screens use return A rows', async () => {
      expect(ids(await replicatedEntriesTable.getEntriesByShow(SHOW))).toEqual(['a1', 'a2']);
      expect(ids(await replicatedEntriesTable.getEntriesByClass(CLASS))).toEqual(['a1', 'a2']);
      expect((await replicatedEntriesTable.getEntryById('a1'))?.id).toBe('a1');
      expect(await hasShowEntriesSynced(SHOW)).toBe(true);
    });

    it('the class list counts A rows', async () => {
      const groups = await fetchAtShowClassList(SHOW);
      expect(groups[0]?.classes[0]?.entry_count).toBe(2);
    });
  });

  describe("B signs in on the same device: none of A's rows", () => {
    beforeEach(() => {
      signInAs('user-b');
    });

    it('getEntriesByShow (class list, entry details, ring conflicts) is empty', async () => {
      expect(await replicatedEntriesTable.getEntriesByShow(SHOW)).toEqual([]);
    });

    it('getEntriesByClass (scoresheet, run order, completion) is empty', async () => {
      expect(await replicatedEntriesTable.getEntriesByClass(CLASS)).toEqual([]);
    });

    it('getEntryById (quick advance, entry detail) is null', async () => {
      expect(await replicatedEntriesTable.getEntryById('a1')).toBeNull();
    });

    it("the class list shows no entries for A's show and the counts are not known", async () => {
      const groups = await fetchAtShowClassList(SHOW);
      expect(groups[0]?.classes[0]?.entry_count).toBe(0);
      expect(await hasShowEntriesSynced(SHOW)).toBe(false);
    });
  });

  it('an unresolved account sees none of the rows', async () => {
    signInAs(null);
    expect(await replicatedEntriesTable.getEntriesByShow(SHOW)).toEqual([]);
    expect(await replicatedEntriesTable.getEntryById('a1')).toBeNull();
  });

  it('A signing back in still reads its own rows: sign-out wiped nothing (MYK9-202)', async () => {
    signInAs('user-b');
    expect(await replicatedEntriesTable.getEntriesByShow(SHOW)).toEqual([]);
    signInAs('user-a');
    expect(ids(await replicatedEntriesTable.getEntriesByShow(SHOW))).toEqual(['a1', 'a2']);
  });
});
