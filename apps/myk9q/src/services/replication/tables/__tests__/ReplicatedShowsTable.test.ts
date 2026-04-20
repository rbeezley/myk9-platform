/**
 * ReplicatedShowsTable Tests
 *
 * Validates the wrapper contract for ReplicatedShowsTable:
 * - Delegation: convenience methods delegate to the underlying ReplicatedTable
 * - Offline enqueue: write methods mark rows dirty (enqueue mutation)
 * - No queue bypass: no direct supabase.from() calls for writes
 * - Query helpers: filtering and sorting of cached shows
 * - Conflict resolution: server-authoritative
 */

import { vi } from 'vitest';
import { ReplicatedShowsTable, type Show } from '../ReplicatedShowsTable';
import { deleteDB } from 'idb';
import './setup'; // real IndexedDB + supabase mock + logger mock

const TEST_DB_NAME = 'myK9Q';
const TEST_LICENSE_KEY = 'test-license-456';

/** Minimal valid show fixture */
function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    license_key: TEST_LICENSE_KEY,
    name: 'Spring Classic',
    start_date: '2026-05-01',
    end_date: '2026-05-03',
    organization: 'AKC',
    status: 'upcoming',
    ...overrides,
  };
}

describe('ReplicatedShowsTable', () => {
  let table: ReplicatedShowsTable;

  beforeEach(async () => {
    await deleteDB(TEST_DB_NAME);
    table = new ReplicatedShowsTable();
  });

  afterEach(async () => {
    await deleteDB(TEST_DB_NAME);
  });

  // ─── Scenario 1: Delegation ────────────────────────────────────────────────

  describe('Delegation — getAllShows delegates to getAll', () => {
    it('returns an empty array when no shows are cached', async () => {
      const shows = await table.getAllShows();
      expect(shows).toEqual([]);
    });

    it('getAllShows returns all stored shows, sorted by start_date', async () => {
      const showA = makeShow({ id: 'show-a', start_date: '2026-06-01', end_date: '2026-06-02' });
      const showB = makeShow({ id: 'show-b', start_date: '2026-05-01', end_date: '2026-05-02' });

      await table.set(showA.id, showA, false);
      await table.set(showB.id, showB, false);

      const shows = await table.getAllShows();

      expect(shows).toHaveLength(2);
      // Sorted ascending by start_date: showB first, showA second
      expect(shows[0].id).toBe('show-b');
      expect(shows[1].id).toBe('show-a');
    });

    it('getShowById delegates to get()', async () => {
      const show = makeShow();
      await table.set(show.id, show, false);

      const found = await table.getShowById(show.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(show.id);
      expect(found?.name).toBe('Spring Classic');
    });

    it('getShowById returns null for a non-existent id', async () => {
      const result = await table.getShowById('does-not-exist');
      expect(result).toBeNull();
    });
  });

  // ─── Scenario 2: Offline enqueue ──────────────────────────────────────────

  describe('Offline enqueue — updateShowStatus marks the row dirty', () => {
    it('updateShowStatus updates local cache optimistically', async () => {
      const show = makeShow({ status: 'upcoming' });
      await table.set(show.id, show, false);

      await table.updateShowStatus(show.id, 'in-progress');

      const updated = await table.get(show.id);
      expect(updated?.status).toBe('in-progress');
    });

    it('updateShowStatus marks the row dirty (queues a mutation)', async () => {
      const show = makeShow({ status: 'upcoming' });
      await table.set(show.id, show, false);

      // Spy on the base-class set() to capture the dirty flag
      const setSpy = vi.spyOn(table, 'set');

      await table.updateShowStatus(show.id, 'completed');

      // updateShowStatus must call this.set(..., true) — the dirty flag
      expect(setSpy).toHaveBeenCalledWith(
        show.id,
        expect.objectContaining({ status: 'completed' }),
        true // dirty = true means mutation is enqueued
      );
    });

    it('updateShowStatus merges additionalFields onto the existing show', async () => {
      const show = makeShow({ status: 'upcoming', venue_name: undefined });
      await table.set(show.id, show, false);

      await table.updateShowStatus(show.id, 'in-progress', { venue_name: 'Main Arena' });

      const updated = await table.get(show.id);
      expect(updated?.status).toBe('in-progress');
      expect(updated?.venue_name).toBe('Main Arena');
    });

    it('updateShowStatus throws when the show is not in cache', async () => {
      await expect(table.updateShowStatus('ghost-id', 'completed')).rejects.toThrow(
        'Show ghost-id not found'
      );
    });
  });

  // ─── Scenario 3: No queue bypass ──────────────────────────────────────────

  describe('No queue bypass — all writes go through this.set(), not supabase.from()', () => {
    it('updateShowStatus does not call supabase.from() directly', async () => {
      const { supabase } = await import('@/lib/supabase');

      const show = makeShow();
      await table.set(show.id, show, false);

      // Reset call count after the set() above (which doesn't call supabase anyway)
      vi.clearAllMocks();

      await table.updateShowStatus(show.id, 'in-progress');

      // supabase.from() must never be called during a write operation
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('getAllShows does not call supabase.from() (reads from IDB cache only)', async () => {
      const { supabase } = await import('@/lib/supabase');
      vi.clearAllMocks();

      await table.getAllShows();

      expect(supabase.from).not.toHaveBeenCalled();
    });
  });

  // ─── Query helpers ────────────────────────────────────────────────────────

  describe('Query helpers', () => {
    beforeEach(async () => {
      // Ensure IDB is clean before seeding query-helper fixtures
      await table.clearCache();

      const shows: Show[] = [
        makeShow({
          id: 'akc-1',
          organization: 'AKC',
          start_date: '2026-05-01',
          end_date: '2026-05-02',
          status: 'upcoming',
        }),
        makeShow({
          id: 'akc-2',
          organization: 'AKC',
          start_date: '2026-06-01',
          end_date: '2026-06-02',
          status: 'completed',
        }),
        makeShow({
          id: 'ukc-1',
          organization: 'UKC',
          start_date: '2026-07-01',
          end_date: '2026-07-02',
          status: 'upcoming',
        }),
      ];
      for (const show of shows) {
        await table.set(show.id, show, false);
      }
    });

    it('getByOrganization filters by organization', async () => {
      const akc = await table.getByOrganization('AKC');
      expect(akc).toHaveLength(2);
      expect(akc.every(s => s.organization === 'AKC')).toBe(true);
    });

    it('getByStatus filters by status', async () => {
      const upcoming = await table.getByStatus('upcoming');
      expect(upcoming).toHaveLength(2);
      expect(upcoming.every(s => s.status === 'upcoming')).toBe(true);
    });

    it('getByDateRange returns shows that overlap the given range', async () => {
      // akc-1 runs 2026-05-01 → 05-02; akc-2 runs 06-01 → 06-02; ukc-1 runs 07-01 → 07-02
      const result = await table.getByDateRange('2026-05-01', '2026-06-15');
      const ids = result.map(s => s.id);
      expect(ids).toContain('akc-1');
      expect(ids).toContain('akc-2');
      expect(ids).not.toContain('ukc-1');
    });
  });

  // ─── Conflict resolution ──────────────────────────────────────────────────

  describe('Conflict resolution — server-authoritative', () => {
    it('resolveConflict always returns the remote (server) value', () => {
      interface TableTestInternals {
        resolveConflict(local: Show, remote: Show): Show;
      }

      const local = makeShow({ status: 'in-progress', name: 'Old Name' });
      const remote = makeShow({ status: 'completed', name: 'New Name' });

      const resolved = (table as unknown as TableTestInternals).resolveConflict(local, remote);

      expect(resolved.status).toBe('completed');
      expect(resolved.name).toBe('New Name');
    });
  });

  // ─── Sync metadata ────────────────────────────────────────────────────────

  describe('Sync metadata', () => {
    it('getSyncMetadata returns null or shows-table metadata (no sync yet)', async () => {
      const metadata = await table.getSyncMetadata();
      // Metadata is only written after a successful sync. In tests with a shared
      // fake-indexeddb, a prior clearCache() call may write syncMetadata, so we
      // accept either null/undefined OR a record scoped to the 'shows' table name.
      expect(metadata == null || metadata?.tableName === 'shows').toBe(true);
    });
  });

  // ─── Cache operations ─────────────────────────────────────────────────────

  describe('Cache operations', () => {
    it('clearCache removes all stored shows', async () => {
      await table.set('show-1', makeShow({ id: 'show-1' }), false);
      await table.set('show-2', makeShow({ id: 'show-2' }), false);

      await table.clearCache();

      const remaining = await table.getAll();
      expect(remaining).toHaveLength(0);
    });
  });
});
