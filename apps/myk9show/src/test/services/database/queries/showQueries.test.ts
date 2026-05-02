import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getAllShows,
  getShowById,
  getUpcomingShows,
  getShowsByDateRange,
  getShowsByClub,
  createShow,
  updateShow,
  deleteShow,
  hardDeleteShow,
  searchShows,
  getShowStatistics,
  getShowsWithEntryCounts,
  getShowsByStatus,
} from '@/services/database/shows';
import type { DbShowInsert, DbShowUpdate } from '@/types/database-mappings';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

// Force replication tables to throw so PostgREST fallback is exercised
vi.mock('@/services/replication/ReplicatedShowsTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedShowsTable: {
      getAllShows: t(),
      getShowById: t(),
      getUpcomingShows: t(),
      getShowsByClub: t(),
      getAll: t(),
    },
  };
});

vi.mock('@/services/replication/ReplicatedClubsTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedClubsTable: { getAllClubs: t(), getClubById: t(), getAll: t() },
  };
});

vi.mock('@/services/replication/ReplicatedTrialsTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedTrialsTable: { getTrialsByShow: t(), getAll: t() },
  };
});

vi.mock('@/services/replication/ReplicatedJudgeAssignmentsTable', () => {
  const t = () => vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
  return {
    replicatedJudgeAssignmentsTable: { getByShowId: t(), getAll: t() },
  };
});

describe('Show Queries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllShows', () => {
    it('should fetch all shows with club and trial information successfully', async () => {
      const mockData = [
        {
          id: '1',
          name: 'Spring Championship',
          start_date: '2024-04-15',
          end_date: '2024-04-17',
          location: 'Central Park',
          club: {
            id: 'club-1',
            name: 'Metropolitan Dog Club',
          },
          trial: [
            {
              id: 'trial-1',
              name: 'Obedience Trial',
              date: '2024-04-15',
              trial_number: 1,
              status: 'open',
            },
          ],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllShows();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should handle database connection errors', async () => {
      const mockError = { message: 'Database unavailable', code: 'CONNECTION_ERROR' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getAllShows();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Database unavailable');
      expect(result.error.table).toBe('show');
      expect(result.error.operation).toBe('select_all_detailed');
    });

    it('should return empty array when no shows exist', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getAllShows();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getShowById', () => {
    it('should fetch show by ID with complete details successfully', async () => {
      const showId = 'show-123';
      const mockData = {
        id: showId,
        name: 'Championship Show',
        start_date: '2024-05-01',
        end_date: '2024-05-03',
        location: 'Convention Center',
        club: {
          id: 'club-1',
          name: 'Elite Dog Club',
        },
        trial: [],
        show_registrations: [],
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getShowById(showId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should handle show not found', async () => {
      const showId = 'non-existent';
      const mockError = { message: 'Row not found', code: 'PGRST116' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getShowById(showId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });
  });

  describe('getUpcomingShows', () => {
    it('should fetch upcoming shows successfully', async () => {
      const mockData = [
        {
          id: '1',
          name: 'Future Show 1',
          start_date: '2024-12-01',
          club: { id: 'club-1', name: 'Club 1' },
          trial: [],
        },
        {
          id: '2',
          name: 'Future Show 2',
          start_date: '2024-12-15',
          club: { id: 'club-2', name: 'Club 2' },
          trial: [],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getUpcomingShows(10);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should use default limit when not specified', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getUpcomingShows();

      expect(result.data).toEqual([]);
    });

    it('should filter by current date correctly', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getUpcomingShows();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getShowsByDateRange', () => {
    it('should fetch shows within date range successfully', async () => {
      const startDate = '2024-04-01';
      const endDate = '2024-04-30';
      const mockData = [
        {
          id: '1',
          name: 'April Show',
          start_date: '2024-04-15',
          end_date: '2024-04-17',
          club: { id: 'club-1', name: 'Club 1' },
          trial: [],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getShowsByDateRange(startDate, endDate);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should return empty array for date range with no shows', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getShowsByDateRange('2025-01-01', '2025-01-31');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getShowsByClub', () => {
    it('should fetch shows by club ID successfully', async () => {
      const clubId = 'club-123';
      const mockData = [
        {
          id: '1',
          name: 'Club Show 1',
          club_id: clubId,
          club: { id: clubId, name: 'Test Club' },
          trial: [],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getShowsByClub(clubId);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });
  });

  describe('createShow', () => {
    it('should create a new show successfully', async () => {
      const showData: DbShowInsert = {
        name: 'New Championship',
        start_date: '2024-06-01',
        end_date: '2024-06-03',
        location: 'New Venue',
        club_id: 'club-123',
        description: 'Annual championship show',
      };

      const mockCreatedShow = {
        ...showData,
        id: 'new-show-id',
        created_at: new Date().toISOString(),
        club: {
          id: 'club-123',
          name: 'Host Club',
          address: '456 Event Ave',
        },
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockCreatedShow, error: null })
      );

      const startTime = Date.now();
      const result = await createShow(showData);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockCreatedShow);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should handle validation errors', async () => {
      const showData: DbShowInsert = {
        name: '',
        start_date: '2024-06-01',
        end_date: '2024-05-30',
        location: 'Venue',
        club_id: 'club-123',
      };

      const mockError = {
        message: 'Check constraint violation',
        code: '23514',
        details: 'End date must be after start date',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await createShow(showData);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23514');
    });
  });

  describe('updateShow', () => {
    it('should update show successfully', async () => {
      const showId = 'show-123';
      const updates: DbShowUpdate = {
        name: 'Updated Show Name',
        location: 'New Location',
      };

      const mockUpdatedShow = {
        id: showId,
        ...updates,
        start_date: '2024-06-01',
        club_id: 'club-123',
        updated_at: new Date().toISOString(),
        club: {
          id: 'club-123',
          name: 'Host Club',
          address: '123 Main St',
        },
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockUpdatedShow, error: null })
      );

      const result = await updateShow(showId, updates);

      expect(result.data).toEqual(mockUpdatedShow);
      expect(result.error).toBeNull();
    });

    it('should handle update of non-existent show', async () => {
      const showId = 'non-existent';
      const updates: DbShowUpdate = { name: 'New Name' };

      const mockError = {
        message: 'No rows updated',
        code: 'PGRST116',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await updateShow(showId, updates);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });
  });

  describe('deleteShow', () => {
    it('should delete show successfully', async () => {
      const showId = 'show-123';
      const mockDeletedShow = {
        id: showId,
        name: 'Deleted Show',
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockDeletedShow, error: null })
      );

      const result = await deleteShow(showId);

      expect(result.data).toEqual(mockDeletedShow);
      expect(result.error).toBeNull();
    });

    it('should handle foreign key constraint violations', async () => {
      const showId = 'show-with-entries';
      const mockError = {
        message: 'Foreign key constraint violation',
        code: '23503',
        details: 'Show has associated entries',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await deleteShow(showId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23503');
    });
  });

  describe('hardDeleteShow', () => {
    it('returns the deleted row when Supabase confirms the delete', async () => {
      const deleted = { id: 'show-123', name: 'Expired Show' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [deleted], error: null }));

      const result = await hardDeleteShow('show-123');

      expect(result.error).toBeNull();
      expect(result.data).toEqual(deleted);
    });

    it('surfaces an error when RLS silently returns zero rows', async () => {
      // PostgREST returns { data: [], error: null } when an RLS policy rejects
      // a DELETE — the previous implementation accepted this as success.
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await hardDeleteShow('show-rls-blocked');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/not deleted|permission/i);
    });

    it('propagates Postgres errors through createDatabaseError', async () => {
      const mockError = { message: 'deadlock detected', code: '40P01', details: null };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await hardDeleteShow('show-err');

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('searchShows', () => {
    it('should search shows by name and location', async () => {
      const searchTerm = 'championship';
      const mockData = [
        {
          id: '1',
          name: 'Spring Championship',
          location: 'Central Park',
          start_date: '2024-04-01',
        },
        {
          id: '2',
          name: 'Regional Show',
          location: 'Championship Arena',
          start_date: '2024-05-01',
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await searchShows(searchTerm);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should return empty results for no matches', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await searchShows('nonexistent');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getShowStatistics', () => {
    it('should fetch show statistics successfully', async () => {
      const mockCount = 15;

      mockSupabase.from.mockReturnValue(createChainableQuery({ error: null, count: mockCount }));

      const result = await getShowStatistics();

      expect(result.data).toEqual({ total: mockCount });
      expect(result.error).toBeNull();
    });

    it('should handle statistics fetch error', async () => {
      const mockError = { message: 'Statistics service unavailable' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ error: mockError, count: null }));

      const result = await getShowStatistics();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('getShowsWithEntryCounts', () => {
    it('should fetch shows with entry counts successfully', async () => {
      const mockData = [
        {
          id: '1',
          name: 'Show with Entries',
          club: { id: 'club-1', name: 'Club 1' },
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getShowsWithEntryCounts();

      expect(result.data).toBeDefined();
      expect(result.data[0].entry_count).toBe(0);
      expect(result.error).toBeNull();
    });

    it('should add entry count to each show', async () => {
      const mockData = [
        { id: '1', name: 'Show 1', club: { id: 'club-1', name: 'Club 1' } },
        { id: '2', name: 'Show 2', club: { id: 'club-2', name: 'Club 2' } },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getShowsWithEntryCounts();

      expect(result.data).toHaveLength(2);
      expect(result.data.every(show => show.entry_count === 0)).toBe(true);
    });
  });

  describe('getShowsByStatus', () => {
    it('should fetch shows by status successfully', async () => {
      const status = 'open';
      const mockData = [
        {
          id: '1',
          name: 'Open Show',
          status: 'open',
          start_date: '2024-06-01',
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getShowsByStatus(status);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should return empty array for status with no shows', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getShowsByStatus('cancelled');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large show datasets efficiently', async () => {
      const mockData = Array(500)
        .fill(null)
        .map((_, i) => ({
          id: `show-${i}`,
          name: `Show ${i}`,
          start_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-01`,
          club: { id: `club-${i % 10}`, name: `Club ${i % 10}` },
          trial: [],
        }));

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllShows();
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(500);
      expect(duration).toBeLessThan(200);
    });

    it('should handle concurrent show queries efficiently', async () => {
      const mockData = [{ id: '1', name: 'Test Show', start_date: '2024-01-01' }];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();

      const promises = [getAllShows(), getUpcomingShows(5), searchShows('test')];
      const results = await Promise.all(promises);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(results.every(r => r.error === null)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed show data', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await getAllShows();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle invalid date ranges', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getShowsByDateRange('2024-12-31', '2024-01-01');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle empty search terms', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await searchShows('');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });
});
