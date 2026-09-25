/**
 * MYK9-746: a show's entries are "loaded" only once a show-scoped sync has
 * completed, never because the store holds a row for the show. Runs against
 * the real IndexedDB-backed table so the check reads the metadata the sync
 * engine and `set()` actually write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { areEntryRowsFromSyncedShows, hasShowEntriesSynced } from './entriesShowSyncState';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function entry(id: string, showId = 'show-1'): ReplicatedEntry {
  return {
    id,
    showId,
    classId: 'class-1',
    dogId: 'dog-1',
    entryStatus: 'confirmed',
  } as ReplicatedEntry;
}

describe('hasShowEntriesSynced (MYK9-746)', () => {
  let table: ReplicatedEntriesTable;

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    table = new ReplicatedEntriesTable();
    // reset() keeps the DATA; ask for an empty store so a shuffled run does
    // not inherit another test's rows or scope metadata.
    await table.clearCache();
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('a single opted-in cold write stores its row but leaves the show unsynced', async () => {
    const result = await table.set('entry-1', entry('entry-1'), true, undefined, undefined, {
      allowColdInsert: 'secretary lifecycle write seeded from the loaded row',
    });

    expect(result).toEqual({ written: true });
    expect(await table.getEntriesByShow('show-1')).toHaveLength(1);
    expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
  });

  it('reports the show synced once its scope records a completed sync', async () => {
    await table.set('entry-1', entry('entry-1'), true, undefined, undefined, {
      allowColdInsert: 'local create',
    });
    // What syncReplicatedTable writes on success, routed to the show's scope.
    await table.updateSyncMetadata({ totalRows: 3 }, { scopeValue: 'show-1' });

    expect(await hasShowEntriesSynced('show-1', table)).toBe(true);
    // Another show's sync proves nothing about this one.
    expect(await hasShowEntriesSynced('show-2', table)).toBe(false);
  });

  it('a synced show with zero entries still counts as synced', async () => {
    await table.updateSyncMetadata({ totalRows: 0 }, { scopeValue: 'show-1' });

    expect(await hasShowEntriesSynced('show-1', table)).toBe(true);
  });

  it('rows are from synced shows only when every show they name has synced', async () => {
    await table.updateSyncMetadata({ totalRows: 2 }, { scopeValue: 'show-1' });

    expect(await areEntryRowsFromSyncedShows([], table)).toBe(true);
    expect(await areEntryRowsFromSyncedShows([entry('a'), entry('b')], table)).toBe(true);
    expect(await areEntryRowsFromSyncedShows([entry('a'), entry('c', 'show-2')], table)).toBe(
      false
    );
    expect(await areEntryRowsFromSyncedShows([{ showId: undefined }], table)).toBe(false);
  });

  it('clearing the cache returns every show to unsynced', async () => {
    await table.updateSyncMetadata({ totalRows: 3 }, { scopeValue: 'show-1' });

    await table.clearCache();

    expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
  });
});
