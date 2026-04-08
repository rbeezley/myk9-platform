import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';

// ---------------------------------------------------------------------------
// Mock the replication singletons using vi.hoisted so the variables are
// available when vi.mock factories execute (vi.mock is hoisted above const).
// ---------------------------------------------------------------------------

const { mockTrialsTable, mockShowsTable } = vi.hoisted(() => ({
  mockTrialsTable: {
    getAll: vi.fn(),
    getTrialById: vi.fn(),
    getTrialsByShow: vi.fn(),
  },
  mockShowsTable: {
    getAllShows: vi.fn(),
    getShowById: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));

// Now import the functions under test
import {
  getAllTrials,
  getTrialById,
  getTrialsByShow,
  searchTrials,
  getTrialsByStatus,
  getUpcomingTrials,
  getTrialsByDateRange,
  getTrialStatistics,
} from '@/services/database/queries/trialQueries';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeTrial(overrides: Partial<ReplicatedTrial> = {}): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Scent Work Trial 1',
    date: '2026-05-01',
    trialNumber: '1',
    status: 'upcoming',
    trialType: 'Scent Work',
    maxEntriesPerDog: 2,
    maxTotalEntries: 50,
    maxEntriesPerHandler: 3,
    ...overrides,
  };
}

function makeShow(overrides: Partial<ReplicatedShow> = {}): ReplicatedShow {
  return {
    id: 'show-1',
    name: 'Spring Championship',
    organization: 'AKC',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers to set up default mocks for list queries
// ---------------------------------------------------------------------------

function setupListMocks(
  trials: ReplicatedTrial[] = [makeTrial()],
  shows: ReplicatedShow[] = [makeShow()]
) {
  mockTrialsTable.getAll.mockResolvedValue(trials);
  mockTrialsTable.getTrialsByShow.mockResolvedValue(trials);
  mockShowsTable.getAllShows.mockResolvedValue(shows);
  mockShowsTable.getShowById.mockResolvedValue(shows[0] ?? null);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('trialQueries (replication)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getAllTrials
  // -----------------------------------------------------------------------
  describe('getAllTrials', () => {
    it('returns correct snake_case shape with joined show data', async () => {
      setupListMocks();

      const result = await getAllTrials();

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const row = result.data[0] as Record<string, unknown>;
      expect(row.id).toBe('trial-1');
      expect(row.name).toBe('Scent Work Trial 1');
      expect(row.date).toBe('2026-05-01');
      expect(row.show_id).toBe('show-1');
      expect(row.trial_number).toBe('1');
      expect(row.status).toBe('upcoming');
      expect(row.trial_type).toBe('Scent Work');
      expect(row.max_entries_per_dog).toBe(2);
      expect(row.max_total_entries).toBe(50);
      expect(row.max_entries_per_handler).toBe(3);
      expect(row.deleted_at).toBeNull();

      // Show sub-object
      const show = row.show as Record<string, unknown>;
      expect(show.id).toBe('show-1');
      expect(show.name).toBe('Spring Championship');
      expect(show.start_date).toBe('2026-05-01');
      expect(show.end_date).toBe('2026-05-02');
    });

    it('returns empty array when no trials exist', async () => {
      setupListMocks([], []);

      const result = await getAllTrials();

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });

    it('sorts by date ascending', async () => {
      const trials = [
        makeTrial({ id: 'trial-b', date: '2026-06-01' }),
        makeTrial({ id: 'trial-a', date: '2026-04-01' }),
      ];
      setupListMocks(trials);

      const result = await getAllTrials();

      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).id).toBe('trial-a');
      expect((result.data[1] as Record<string, unknown>).id).toBe('trial-b');
    });

    it('sets show to null when trial has no showId', async () => {
      setupListMocks([makeTrial({ showId: undefined })]);

      const result = await getAllTrials();
      const row = result.data[0] as Record<string, unknown>;
      expect(row.show).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getTrialById
  // -----------------------------------------------------------------------
  describe('getTrialById', () => {
    it('returns correct snake_case shape with show join', async () => {
      mockTrialsTable.getTrialById.mockResolvedValue(makeTrial());
      mockShowsTable.getShowById.mockResolvedValue(makeShow());

      const result = await getTrialById('trial-1');

      expect(result.error).toBeNull();
      const row = result.data as Record<string, unknown>;
      expect(row.id).toBe('trial-1');

      const show = row.show as Record<string, unknown>;
      expect(show.id).toBe('show-1');
      expect(show.name).toBe('Spring Championship');
    });

    it('returns { data: null, error: null } for missing records', async () => {
      mockTrialsTable.getTrialById.mockResolvedValue(null);

      const result = await getTrialById('non-existent');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getTrialsByShow
  // -----------------------------------------------------------------------
  describe('getTrialsByShow', () => {
    it('returns trials for a specific show with show join', async () => {
      const trials = [
        makeTrial({ id: 'trial-1', showId: 'show-1' }),
        makeTrial({ id: 'trial-2', showId: 'show-1', name: 'Trial 2', date: '2026-05-02' }),
      ];
      mockTrialsTable.getTrialsByShow.mockResolvedValue(trials);
      mockShowsTable.getShowById.mockResolvedValue(makeShow());

      const result = await getTrialsByShow('show-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      expect((result.data[0] as Record<string, unknown>).show_id).toBe('show-1');
    });

    it('returns empty array when show has no trials', async () => {
      mockTrialsTable.getTrialsByShow.mockResolvedValue([]);
      mockShowsTable.getShowById.mockResolvedValue(makeShow());

      const result = await getTrialsByShow('show-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // searchTrials
  // -----------------------------------------------------------------------
  describe('searchTrials', () => {
    it('filters by name case-insensitively', async () => {
      const trials = [
        makeTrial({ id: 'match', name: 'Scent Work Trial' }),
        makeTrial({ id: 'no-match', name: 'Agility Run' }),
      ];
      setupListMocks(trials);

      const result = await searchTrials('scent');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('returns empty array for no matches', async () => {
      setupListMocks([makeTrial()]);

      const result = await searchTrials('zzzznonexistent');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getTrialsByStatus
  // -----------------------------------------------------------------------
  describe('getTrialsByStatus', () => {
    it('filters by status', async () => {
      const trials = [
        makeTrial({ id: 'upcoming-1', status: 'upcoming' }),
        makeTrial({ id: 'completed-1', status: 'completed' }),
      ];
      setupListMocks(trials);

      const result = await getTrialsByStatus('upcoming');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('upcoming-1');
    });

    it('returns empty when no trials match status', async () => {
      setupListMocks([makeTrial({ status: 'upcoming' })]);

      const result = await getTrialsByStatus('cancelled');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getUpcomingTrials
  // -----------------------------------------------------------------------
  describe('getUpcomingTrials', () => {
    it('filters by date >= today and respects limit', async () => {
      const futureDate = '2099-01-01';
      const trials = Array.from({ length: 5 }, (_, i) =>
        makeTrial({ id: `trial-${i}`, date: `2099-0${i + 1}-01` })
      );
      setupListMocks(trials);

      const result = await getUpcomingTrials(3);

      expect(result.data).toHaveLength(3);
      // Should be sorted ascending by date
      expect((result.data[0] as Record<string, unknown>).date).toBe('2099-01-01');
    });

    it('returns all future trials when no limit specified', async () => {
      const trials = [
        makeTrial({ id: 'future', date: '2099-06-01' }),
        makeTrial({ id: 'past', date: '2020-01-01' }),
      ];
      setupListMocks(trials);

      const result = await getUpcomingTrials();

      // Only the future trial should be included
      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('future');
    });

    it('returns empty array when no upcoming trials', async () => {
      setupListMocks([makeTrial({ date: '2020-01-01' })]);

      const result = await getUpcomingTrials();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getTrialsByDateRange
  // -----------------------------------------------------------------------
  describe('getTrialsByDateRange', () => {
    it('filters trials within date range', async () => {
      const trials = [
        makeTrial({ id: 'in-range', date: '2026-05-15' }),
        makeTrial({ id: 'out-of-range', date: '2026-07-01' }),
      ];
      setupListMocks(trials);

      const result = await getTrialsByDateRange('2026-05-01', '2026-06-01');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('in-range');
    });

    it('returns empty array when no trials match range', async () => {
      setupListMocks([makeTrial({ date: '2026-01-01' })]);

      const result = await getTrialsByDateRange('2026-06-01', '2026-07-01');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getTrialStatistics
  // -----------------------------------------------------------------------
  describe('getTrialStatistics', () => {
    it('returns total count and byStatus breakdown', async () => {
      const trials = [
        makeTrial({ id: 'a', status: 'upcoming' }),
        makeTrial({ id: 'b', status: 'upcoming' }),
        makeTrial({ id: 'c', status: 'completed' }),
      ];
      setupListMocks(trials);

      const result = await getTrialStatistics();

      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        total: 3,
        byStatus: {
          upcoming: 2,
          completed: 1,
        },
      });
    });

    it('returns 0 total when no trials exist', async () => {
      setupListMocks([]);

      const result = await getTrialStatistics();

      expect(result.data).toEqual({ total: 0, byStatus: {} });
      expect(result.error).toBeNull();
    });

    it('groups trials with null status under Unknown', async () => {
      const trials = [
        makeTrial({ id: 'a', status: undefined }),
        makeTrial({ id: 'b', status: 'upcoming' }),
      ];
      setupListMocks(trials);

      const result = await getTrialStatistics();

      expect(result.data).toEqual({
        total: 2,
        byStatus: {
          Unknown: 1,
          upcoming: 1,
        },
      });
    });
  });
});
