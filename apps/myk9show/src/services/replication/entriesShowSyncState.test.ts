/**
 * MYK9-746: a show's entries are "loaded" only once a show-scoped sync has
 * completed, never because the store holds a row for the show. Runs against
 * the real IndexedDB-backed table so the check reads the metadata the sync
 * engine and `set()` actually write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, type ReplicatedEntry } from './ReplicatedEntriesTable';
import { MutationManager } from '@myk9/replication';
import { getScopeOwnership } from './scopeAccountStamp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readPersistedAuthUserId } from '@/services/database/persistedAuthUserId';
import { signInReplicatedTable } from '@/test/utils/signedInReplication';
import {
  areEntryRowsFromSyncedShows,
  assertShowEntriesNotForeign,
  hasShowEntriesSynced,
  hasUnsavedLocalEntryWrites,
} from './entriesShowSyncState';

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
    signInReplicatedTable(table, 'user-a');
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
    await table.updateSyncMetadata(
      { totalRows: 3 },
      { scopeValue: 'show-1', scopeSyncedBy: 'user-a' }
    );

    expect(await hasShowEntriesSynced('show-1', table)).toBe(true);
    // Another show's sync proves nothing about this one.
    expect(await hasShowEntriesSynced('show-2', table)).toBe(false);
  });

  it('a synced show with zero entries still counts as synced', async () => {
    await table.updateSyncMetadata(
      { totalRows: 0 },
      { scopeValue: 'show-1', scopeSyncedBy: 'user-a' }
    );

    expect(await hasShowEntriesSynced('show-1', table)).toBe(true);
  });

  it('rows are from synced shows only when every show they name has synced', async () => {
    await table.updateSyncMetadata(
      { totalRows: 2 },
      { scopeValue: 'show-1', scopeSyncedBy: 'user-a' }
    );

    expect(await areEntryRowsFromSyncedShows([], table)).toBe(true);
    expect(await areEntryRowsFromSyncedShows([entry('a'), entry('b')], table)).toBe(true);
    expect(await areEntryRowsFromSyncedShows([entry('a'), entry('c', 'show-2')], table)).toBe(
      false
    );
    expect(await areEntryRowsFromSyncedShows([{ showId: undefined }], table)).toBe(false);
  });

  it('reports unsaved writes only while a row for the show is dirty', async () => {
    vi.spyOn(table, 'hasPendingWritesForShow').mockResolvedValue(false);
    await table.batchSet([entry('synced-1'), entry('other-show', 'show-2')]);
    expect(await hasUnsavedLocalEntryWrites('show-1', table)).toBe(false);

    await table.set('local-1', entry('local-1'), true, undefined, undefined, {
      allowColdInsert: 'local create',
    });
    expect(await hasUnsavedLocalEntryWrites('show-1', table)).toBe(true);
    expect(await hasUnsavedLocalEntryWrites('show-2', table)).toBe(false);

    await table.markAsSynced('local-1');
    expect(await hasUnsavedLocalEntryWrites('show-1', table)).toBe(false);
  });

  it('clearing the cache returns every show to unsynced', async () => {
    await table.updateSyncMetadata(
      { totalRows: 3 },
      { scopeValue: 'show-1', scopeSyncedBy: 'user-a' }
    );

    await table.clearCache();

    expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
  });

  describe('whose sync it was (MYK9-1133)', () => {
    const stamp = (syncedBy?: string) =>
      table.updateSyncMetadata(
        { totalRows: 2 },
        { scopeValue: 'show-1', ...(syncedBy ? { scopeSyncedBy: syncedBy } : {}) }
      );

    it("a scope another account synced is not this account's", async () => {
      await stamp('user-b');

      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
    });

    it('a scope with no stamp (a cache from before the stamp) is cold', async () => {
      await stamp();

      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
    });

    it('an unresolved account owns no scope', async () => {
      await stamp('user-a');
      vi.spyOn(table, 'getCurrentAuthUserId').mockResolvedValue(null);

      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
    });

    it('a metadata read that fails is not a never-synced scope: it reads as not this account', async () => {
      await stamp('user-a');
      vi.spyOn(table, 'getSyncMetadataOrThrow').mockRejectedValue(new Error('IndexedDB timed out'));

      expect(await getScopeOwnership(table, 'show-1')).toBe('unreadable');
      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
      await expect(assertShowEntriesNotForeign('show-1', table)).rejects.toMatchObject({
        name: 'ForeignReplicaScopeError',
      });
    });
  });

  // The expired-token-offline case, end to end through the real manager: the
  // live lookup throws (as getSession() does), the persisted session answers.
  describe('offline with an expired token (MYK9-1133)', () => {
    const KEY = 'sb-test-auth-token';
    let persisted: Record<string, string>;

    beforeEach(() => {
      persisted = {};
      vi.restoreAllMocks();
      const manager = new MutationManager({} as SupabaseClient, {
        getCurrentUserId: async () => {
          throw new Error('AuthRetryableFetchError');
        },
        getCachedUserId: () => readPersistedAuthUserId({ getItem: k => persisted[k] ?? null }, KEY),
      });
      table.setMutationManager(manager);
    });

    const persistSession = (id: string) => {
      persisted[KEY] = JSON.stringify({ access_token: 'expired', user: { id } });
    };
    const syncedBy = (id: string) =>
      table.updateSyncMetadata({ totalRows: 2 }, { scopeValue: 'show-1', scopeSyncedBy: id });

    it("an account's own stamped show still reads as synced", async () => {
      await syncedBy('user-a');
      persistSession('user-a');

      expect(await hasShowEntriesSynced('show-1', table)).toBe(true);
    });

    it('no persisted session means the show reads as not this account (cold, not empty)', async () => {
      await syncedBy('user-a');

      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
    });

    it("another account's persisted session leaves the first account's show foreign", async () => {
      await syncedBy('user-a');
      persistSession('user-b');

      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
    });

    it('sign-out then B signing in replaces the persisted session, so A is not reused', async () => {
      await syncedBy('user-a');
      persistSession('user-a');
      expect(await hasShowEntriesSynced('show-1', table)).toBe(true);

      delete persisted[KEY];
      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);

      persistSession('user-b');
      expect(await hasShowEntriesSynced('show-1', table)).toBe(false);
    });
  });
});
