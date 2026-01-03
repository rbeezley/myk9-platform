import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  getAllShows, 
  getShowById, 
  getUpcomingShows,
  getShowsByDateRange,
  getShowsByClub,
  createShow,
  updateShow,
  deleteShow,
  searchShows,
  getShowStatistics,
  getShowsWithEntryCounts,
  getShowsByStatus
} from '@/services/database/queries/showQueries';
import type { DbShowInsert, DbShowUpdate } from '@/types/database-mappings';

// Mock the supabase client
vi.mock('@/services/database/supabaseClient', () => {
  const mockSupabaseFrom = vi.fn();
  
  return {
    supabase: {
      from: mockSupabaseFrom
    },
    logQuery: vi.fn(),
    createDatabaseError: vi.fn((error, table, operation) => ({
      message: error?.message || 'Database error',
      table,
      operation,
      details: error?.details,
      code: error?.code,
    }))
  };
});

describe('Show Queries', () => {
  let mockSupabaseFrom: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked supabase client
    const { supabase } = await import('@/services/database/supabaseClient');
    mockSupabaseFrom = supabase.from as ReturnType<typeof vi.fn>;
  });

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
            name: 'Metropolitan Dog Club'
          },
          trial: [
            {
              id: 'trial-1',
              name: 'Obedience Trial',
              date: '2024-04-15',
              trial_number: 1,
              status: 'open'
            }
          ]
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockData,
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await getAllShows();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200); // Response time validation
      expect(mockSupabaseFrom).toHaveBeenCalledWith('show');
      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('club:club('));
      expect(mockQuery.order).toHaveBeenCalledWith('start_date', { ascending: true });
    });

    it('should handle database connection errors', async () => {
      const mockError = { message: 'Database unavailable', code: 'CONNECTION_ERROR' };
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllShows();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Database unavailable');
      expect(result.error.table).toBe('show');
      expect(result.error.operation).toBe('select_all');
    });

    it('should return empty array when no shows exist', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
          address: '123 Main St',
          phone: '555-1234',
          email: 'info@elitedog.com',
          website: 'https://elitedog.com'
        },
        trial: [
          {
            id: 'trial-1',
            name: 'Agility Trial',
            date: '2024-05-01',
            trial_number: 1,
            status: 'open',
            max_entries_per_dog: 3,
            max_total_entries: 100
          }
        ],
        show_registrations: [
          {
            id: 'reg-1',
            person: {
              id: 'user-1',
              first_name: 'John',
              last_name: 'Doe',
              email: 'john@example.com'
            },
            registration_type: 'individual',
            payment_status: 'paid',
            total_amount: 150.00
          }
        ]
      };

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockData,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await getShowById(showId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockQuery.eq).toHaveBeenCalledWith('id', showId);
      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('show_registrations('));
    });

    it('should handle show not found', async () => {
      const showId = 'non-existent';
      const mockError = { message: 'Row not found', code: 'PGRST116' };
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: mockError
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
          trial: []
        },
        {
          id: '2',
          name: 'Future Show 2',
          start_date: '2024-12-15',
          club: { id: 'club-2', name: 'Club 2' },
          trial: []
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getUpcomingShows(10);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.gte).toHaveBeenCalledWith('start_date', expect.any(String));
      expect(mockQuery.limit).toHaveBeenCalledWith(10);
    });

    it('should use default limit when not specified', async () => {
      const mockData = [];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getUpcomingShows(); // No limit specified

      expect(result.data).toEqual(mockData);
      expect(mockQuery.limit).toHaveBeenCalledWith(10); // Default limit
    });

    it('should filter by current date correctly', async () => {
      const mockData = [];
      const today = new Date().toISOString().split('T')[0];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      await getUpcomingShows();

      expect(mockQuery.gte).toHaveBeenCalledWith('start_date', today);
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
          trial: []
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowsByDateRange(startDate, endDate);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.gte).toHaveBeenCalledWith('start_date', startDate);
      expect(mockQuery.lte).toHaveBeenCalledWith('end_date', endDate);
    });

    it('should return empty array for date range with no shows', async () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-31';

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowsByDateRange(startDate, endDate);

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
          trial: []
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockData,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowsByClub(clubId);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.eq).toHaveBeenCalledWith('club_id', clubId);
      expect(mockQuery.order).toHaveBeenCalledWith('start_date', { ascending: false });
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
        description: 'Annual championship show'
      };

      const mockCreatedShow = {
        ...showData,
        id: 'new-show-id',
        created_at: new Date().toISOString(),
        club: {
          id: 'club-123',
          name: 'Host Club',
          address: '456 Event Ave'
        }
      };

      const mockQuery = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCreatedShow,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await createShow(showData);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockCreatedShow);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockQuery.insert).toHaveBeenCalledWith([showData]);
    });

    it('should handle validation errors', async () => {
      const showData: DbShowInsert = {
        name: '', // Invalid empty name
        start_date: '2024-06-01',
        end_date: '2024-05-30', // End date before start date
        location: 'Venue',
        club_id: 'club-123'
      };

      const mockError = { 
        message: 'Check constraint violation', 
        code: '23514',
        details: 'End date must be after start date'
      };

      const mockQuery = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: mockError
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
        location: 'New Location'
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
          address: '123 Main St'
        }
      };

      const mockQuery = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockUpdatedShow,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await updateShow(showId, updates);

      expect(result.data).toEqual(mockUpdatedShow);
      expect(result.error).toBeNull();
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String)
        })
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('id', showId);
    });

    it('should handle update of non-existent show', async () => {
      const showId = 'non-existent';
      const updates: DbShowUpdate = { name: 'New Name' };

      const mockError = { 
        message: 'No rows updated', 
        code: 'PGRST116'
      };

      const mockQuery = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: mockError
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
        name: 'Deleted Show'
      };

      const mockQuery = {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockDeletedShow,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await deleteShow(showId);

      expect(result.data).toEqual(mockDeletedShow);
      expect(result.error).toBeNull();
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', showId);
    });

    it('should handle foreign key constraint violations', async () => {
      const showId = 'show-with-entries';
      const mockError = { 
        message: 'Foreign key constraint violation', 
        code: '23503',
        details: 'Show has associated entries'
      };

      const mockQuery = {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: mockError
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await deleteShow(showId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23503');
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
          start_date: '2024-04-01'
        },
        { 
          id: '2', 
          name: 'Regional Show', 
          location: 'Championship Arena',
          start_date: '2024-05-01'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockData,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await searchShows(searchTerm);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockQuery.or).toHaveBeenCalledWith(
        expect.stringContaining(`name.ilike.%${searchTerm}%`)
      );
    });

    it('should return empty results for no matches', async () => {
      const searchTerm = 'nonexistent';
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await searchShows(searchTerm);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getShowStatistics', () => {
    it('should fetch show statistics successfully', async () => {
      const mockCount = 15;

      const mockQuery = {
        select: vi.fn().mockResolvedValue({
          error: null,
          count: mockCount
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowStatistics();

      expect(result.data).toEqual({ total: mockCount });
      expect(result.error).toBeNull();
      expect(mockQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    });

    it('should handle statistics fetch error', async () => {
      const mockError = { message: 'Statistics service unavailable' };

      const mockQuery = {
        select: vi.fn().mockResolvedValue({
          error: mockError,
          count: null
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
          club: { id: 'club-1', name: 'Club 1' }
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockData,
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowsWithEntryCounts();

      expect(result.data).toBeDefined();
      expect(result.data[0].entry_count).toBe(0); // Default entry count
      expect(result.error).toBeNull();
    });

    it('should add entry count to each show', async () => {
      const mockData = [
        { id: '1', name: 'Show 1', club: { id: 'club-1', name: 'Club 1' } },
        { id: '2', name: 'Show 2', club: { id: 'club-2', name: 'Club 2' } }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockData,
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
          start_date: '2024-06-01'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockData,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowsByStatus(status);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.eq).toHaveBeenCalledWith('status', status);
    });

    it('should return empty array for status with no shows', async () => {
      const status = 'cancelled';
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowsByStatus(status);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large show datasets efficiently', async () => {
      const mockData = Array(500).fill(null).map((_, i) => ({
        id: `show-${i}`,
        name: `Show ${i}`,
        start_date: `2024-${String(i % 12 + 1).padStart(2, '0')}-01`,
        club: { id: `club-${i % 10}`, name: `Club ${i % 10}` },
        trial: []
      }));

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockImplementation(() => 
            new Promise((resolve) => {
              setTimeout(() => resolve({
                data: mockData,
                error: null
              }), 150);
            })
          )
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await getAllShows();
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(500);
      expect(duration).toBeLessThan(200);
    });

    it('should handle concurrent show queries efficiently', async () => {
      const mockData = [{ id: '1', name: 'Test Show', start_date: '2024-01-01' }];
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: mockData,
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      
      const promises = [
        getAllShows(),
        getUpcomingShows(5),
        getShowStatistics(),
        searchShows('test')
      ];
      const results = await Promise.all(promises);
      
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(results.every(r => r.error === null)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed show data', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null, // Malformed response
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllShows();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle invalid date ranges', async () => {
      const startDate = '2024-12-31';
      const endDate = '2024-01-01'; // End before start
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getShowsByDateRange(startDate, endDate);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle empty search terms', async () => {
      const searchTerm = '';
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await searchShows(searchTerm);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });
});