import { createDatabaseError } from '@/services/database/databaseError';
import { onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSupabase } from '@/test/mocks/supabase';
import { getClassesWithCapacity } from '@/services/database/day-of-operations/entries';
import { getPendingMoveUpRequests } from '@/services/database/day-of-operations/move-up';
import { getPullableEntries } from '@/services/database/day-of-operations/scratch';
import { fetchReplicatedCheckInEntries } from '@/hooks/queries/useCheckInReportReplication';
import { loadOfflineCapacityOverrides } from '@/features/registration/offlineCapacityOverride';

/**
 * MYK9-761: show readers that count or list a show's entries from the local
 * replica alone must not present a never-synced show as the whole show. The
 * scenario is MYK9-746's: a fresh device, one local write (a check-in) stored
 * with `allowColdInsert`, and no completed show sync, so the per-show sync
 * metadata carries no `totalRows`.
 */

const SHOW_ID = 'show-1';

const state = vi.hoisted(() => ({
  entries: [] as Array<Record<string, unknown>>,
  synced: false,
  judgeReadFails: false,
  sync: vi.fn(),
}));

// The replica the sync-state helper reads: real `hasShowEntriesSynced`, real
// bounded refresh, fake table underneath.
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    getSyncMetadata: vi.fn(async () =>
      state.synced
        ? { tableName: 'entries', totalRows: state.entries.length }
        : { tableName: 'entries' }
    ),
    sync: (...args: unknown[]) => state.sync(...args),
  },
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    getEntriesByShow: vi.fn(async () => state.entries),
  },
  replicatedTrialsTable: {
    getTrialsByShow: vi.fn(async () => [{ id: 'trial-1', date: '2026-10-10' }]),
  },
  replicatedClassesTable: {
    getClassesByTrial: vi.fn(async () => [
      { id: 'class-1', name: 'Novice A', trialId: 'trial-1', maxEntries: 2 },
    ]),
    getClassById: vi.fn(async () => ({ id: 'class-1', name: 'Novice A', trialId: 'trial-1' })),
    getAll: vi.fn(async () => [{ id: 'class-1', trialId: 'trial-1', maxEntries: 2 }]),
  },
  replicatedDogsTable: {
    getDogById: vi.fn(async () => null),
  },
  replicatedArmbandsTable: {
    getByShow: vi.fn(async () => []),
  },
  replicatedShowsTable: {
    getShowById: vi.fn(async () => ({ id: SHOW_ID, defaultJudgeDayCapacity: 125 })),
  },
  replicatedJudgeAssignmentsTable: {
    getByShowId: vi.fn(async () => []),
    getAllWithStatus: vi.fn(async () =>
      state.judgeReadFails
        ? { ok: false, rows: [], error: new Error('IndexedDB read timed out') }
        : { ok: true, rows: [], error: null }
    ),
  },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError,
}));

vi.mock('@/services/database/entries/lifecycle', () => ({
  denyMoveUpRequest: vi.fn(),
  pullEntryDayOf: vi.fn(),
}));

function entry(id: string, entryStatus: string, moveUp = false) {
  return {
    id,
    showId: SHOW_ID,
    classId: 'class-1',
    trialId: 'trial-1',
    dogId: `dog-${id}`,
    entryStatus: moveUp ? 'move-up-requested' : entryStatus,
    checkInStatus: 'checked-in',
    handler: 'Taylor Rivera',
  };
}

// The one row a check-in on a fresh device leaves behind.
const ONE_LOCAL_WRITE = [entry('checked-in-here', 'confirmed')];
// The show as the server holds it: the class is full, one move-up is pending.
const WHOLE_SHOW = [
  entry('checked-in-here', 'confirmed'),
  entry('other', 'confirmed'),
  entry('pending-move', 'confirmed', true),
];

describe('show-scoped local readers on a show that has not synced (MYK9-761)', () => {
  beforeEach(() => {
    state.entries = ONE_LOCAL_WRITE;
    state.synced = false;
    state.sync.mockReset();
    state.sync.mockResolvedValue({ success: false });
  });

  afterEach(() => {
    onlineManager.setOnline(true);
  });

  describe('offline, cold store plus one local write', () => {
    beforeEach(() => {
      onlineManager.setOnline(false);
    });

    it('day-of capacity reports an error, not open spots', async () => {
      const result = await getClassesWithCapacity(SHOW_ID);
      expect(result.error).not.toBeNull();
      expect(result.data).toEqual([]);
    });

    it('the day-of lists report an error, not a partial list', async () => {
      const moveUps = await getPendingMoveUpRequests(SHOW_ID);
      const pullable = await getPullableEntries(SHOW_ID);
      expect(moveUps.error).not.toBeNull();
      expect(pullable.error).not.toBeNull();
      expect(pullable.data).toEqual([]);
    });

    it('the check-in report rejects instead of listing one exhibitor', async () => {
      await expect(fetchReplicatedCheckInEntries(SHOW_ID)).rejects.toThrow(/not finished loading/);
    });

    it('the offline capacity override refuses to call a class open', async () => {
      await expect(
        loadOfflineCapacityOverrides(SHOW_ID, [{ key: 'dog-new|class-1', classId: 'class-1' }])
      ).rejects.toThrow(/not finished loading/);
    });

    it('does not attempt the show sync offline', async () => {
      await getClassesWithCapacity(SHOW_ID);
      expect(state.sync).not.toHaveBeenCalled();
    });
  });

  describe('online, cold store plus one local write, sync fails', () => {
    it('tries the show sync once and still reports an error', async () => {
      const result = await getClassesWithCapacity(SHOW_ID);
      expect(state.sync).toHaveBeenCalledWith(SHOW_ID);
      expect(result.error).not.toBeNull();
    });
  });

  describe('online, the show sync completes', () => {
    beforeEach(() => {
      state.sync.mockImplementation(async () => {
        state.entries = WHOLE_SHOW;
        state.synced = true;
        return { success: true };
      });
    });

    it('capacity counts the whole show', async () => {
      const result = await getClassesWithCapacity(SHOW_ID);
      expect(result.error).toBeNull();
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'class-1', accepted_count: 2, available_spots: 0 })
      );
    });

    it('the move-up list and the check-in report read the synced rows', async () => {
      const moveUps = await getPendingMoveUpRequests(SHOW_ID);
      expect(moveUps.data.map(row => row.id)).toEqual(['pending-move']);
      state.synced = true;
      const rows = await fetchReplicatedCheckInEntries(SHOW_ID);
      expect(rows.map(row => row.id).sort()).toEqual(
        ['checked-in-here', 'other', 'pending-move'].sort()
      );
    });

    it('the offline capacity override sees the full class', async () => {
      const overrides = await loadOfflineCapacityOverrides(SHOW_ID, [
        { key: 'dog-new|class-1', classId: 'class-1' },
      ]);
      expect(overrides).toEqual({ 'dog-new|class-1': true });
    });

    // MYK9-772: a failed judge-assignment read built no judge-day keys, so a
    // full judge-day was never counted as full offline. It must fail instead.
    it('the offline capacity override refuses to count on a failed judge read', async () => {
      state.judgeReadFails = true;
      try {
        await expect(
          loadOfflineCapacityOverrides(SHOW_ID, [{ key: 'dog-new|class-1', classId: 'class-1' }])
        ).rejects.toThrow(/We couldn't check class capacity on this device/);
      } finally {
        state.judgeReadFails = false;
      }
    });
  });

  it('a show that has synced reads locally without a refresh, offline too', async () => {
    onlineManager.setOnline(false);
    state.entries = WHOLE_SHOW;
    state.synced = true;
    const result = await getClassesWithCapacity(SHOW_ID);
    expect(result.error).toBeNull();
    expect(result.data[0]).toEqual(expect.objectContaining({ accepted_count: 2 }));
    expect(state.sync).not.toHaveBeenCalled();
  });
});
