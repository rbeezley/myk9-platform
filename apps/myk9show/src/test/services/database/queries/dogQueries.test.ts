import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  getAllDogs, 
  getDogById, 
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  getDogsWithUpcomingShows,
  getDogStatistics
} from '@/services/database/queries/dogQueries';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';

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

describe('Dog Queries', () => {
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

  describe('getAllDogs', () => {
    it('should fetch all dogs with owner information successfully', async () => {
      const mockData = [
        {
          id: '1',
          name: 'Buddy',
          breed: 'Golden Retriever',
          owner: {
            id: 'owner-1',
            first_name: 'John',
            last_name: 'Doe',
            email: 'john@example.com'
          }
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
      const result = await getAllDogs();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200); // Response time validation
      expect(mockSupabaseFrom).toHaveBeenCalledWith('dog');
      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('owner:"user"'));
    });

    it('should handle database errors gracefully', async () => {
      const mockError = { message: 'Connection failed', code: 'CONNECTION_ERROR' };
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Connection failed');
      expect(result.error.table).toBe('dog');
      expect(result.error.operation).toBe('select_all');
    });

    it('should handle network timeout errors', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockRejectedValue(new Error('Network timeout'))
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Network timeout');
    });

    it('should return empty array when no dogs exist', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getDogById', () => {
    it('should fetch dog by ID with full details successfully', async () => {
      const dogId = 'dog-123';
      const mockData = {
        id: dogId,
        name: 'Buddy',
        breed: 'Golden Retriever',
        owner: {
          id: 'owner-1',
          first_name: 'John',
          last_name: 'Doe'
        },
        registrations: [],
        health_record: [],
        entry: []
      };

      const mockSingle = vi.fn().mockResolvedValue({
        data: mockData,
        error: null
      });
      const mockEq = vi.fn().mockReturnValue({
        single: mockSingle
      });
      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq
      });

      mockSupabaseFrom.mockReturnValue({
        select: mockSelect
      });

      const startTime = Date.now();
      const result = await getDogById(dogId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockEq).toHaveBeenCalledWith('id', dogId);
    });

    it('should handle dog not found', async () => {
      const dogId = 'non-existent';
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

      const result = await getDogById(dogId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });

    it('should validate response time for single record fetch', async () => {
      const dogId = 'dog-123';
      const mockData = { id: dogId, name: 'Test Dog' };

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => 
              new Promise((resolve) => {
                setTimeout(() => resolve({ data: mockData, error: null }), 50);
              })
            )
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await getDogById(dogId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(duration).toBeLessThan(200); // Should be fast
    });
  });

  describe('getDogsByOwner', () => {
    it('should fetch dogs by owner ID successfully', async () => {
      const ownerId = 'owner-123';
      const mockData = [
        { id: '1', name: 'Dog 1', owner_id: ownerId },
        { id: '2', name: 'Dog 2', owner_id: ownerId }
      ];

      const mockOrder = vi.fn().mockResolvedValue({
        data: mockData,
        error: null
      });
      const mockEq = vi.fn().mockReturnValue({
        order: mockOrder
      });
      const mockSelect = vi.fn().mockReturnValue({
        eq: mockEq
      });

      mockSupabaseFrom.mockReturnValue({
        select: mockSelect
      });

      const result = await getDogsByOwner(ownerId);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockEq).toHaveBeenCalledWith('owner_id', ownerId);
    });

    it('should return empty array for owner with no dogs', async () => {
      const ownerId = 'owner-no-dogs';
      
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

      const result = await getDogsByOwner(ownerId);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('createDog', () => {
    it('should create a new dog successfully', async () => {
      const dogData: DbDogInsert = {
        name: 'New Dog',
        breed: 'Labrador',
        owner_id: 'owner-123',
        call_name: 'Buddy'
      };

      const mockCreatedDog = {
        ...dogData,
        id: 'new-dog-id',
        created_at: new Date().toISOString(),
        owner: {
          id: 'owner-123',
          first_name: 'John',
          last_name: 'Doe'
        }
      };

      const mockQuery = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCreatedDog,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await createDog(dogData);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockCreatedDog);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockQuery.insert).toHaveBeenCalledWith([dogData]);
    });

    it('should handle validation errors', async () => {
      const dogData: DbDogInsert = {
        name: '',  // Invalid empty name
        breed: 'Labrador',
        owner_id: 'owner-123'
      };

      const mockError = { 
        message: 'Validation failed', 
        code: '23514',
        details: 'Name cannot be empty'
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

      const result = await createDog(dogData);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23514');
      expect(result.error.details).toBe('Name cannot be empty');
    });
  });

  describe('updateDog', () => {
    it('should update dog successfully', async () => {
      const dogId = 'dog-123';
      const updates: DbDogUpdate = {
        name: 'Updated Name',
        breed: 'Updated Breed'
      };

      const mockUpdatedDog = {
        id: dogId,
        ...updates,
        updated_at: new Date().toISOString(),
        owner: {
          id: 'owner-123',
          first_name: 'John'
        }
      };

      const mockQuery = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockUpdatedDog,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await updateDog(dogId, updates);

      expect(result.data).toEqual(mockUpdatedDog);
      expect(result.error).toBeNull();
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String)
        })
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('id', dogId);
    });

    it('should handle update of non-existent dog', async () => {
      const dogId = 'non-existent';
      const updates: DbDogUpdate = { name: 'New Name' };

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

      const result = await updateDog(dogId, updates);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });
  });

  describe('deleteDog', () => {
    it('should delete dog successfully', async () => {
      const dogId = 'dog-123';
      const mockDeletedDog = {
        id: dogId,
        name: 'Deleted Dog'
      };

      const mockQuery = {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockDeletedDog,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await deleteDog(dogId);

      expect(result.data).toEqual(mockDeletedDog);
      expect(result.error).toBeNull();
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', dogId);
    });

    it('should handle deletion of non-existent dog', async () => {
      const dogId = 'non-existent';
      const mockError = { 
        message: 'No rows deleted', 
        code: 'PGRST116'
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

      const result = await deleteDog(dogId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('searchDogs', () => {
    it('should search dogs by term successfully', async () => {
      const searchTerm = 'golden';
      const mockData = [
        { id: '1', name: 'Golden Boy', breed: 'Golden Retriever' },
        { id: '2', name: 'Buddy', breed: 'Golden Retriever' }
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
      const result = await searchDogs(searchTerm);
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

      const result = await searchDogs(searchTerm);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getDogsWithUpcomingShows', () => {
    it('should fetch dogs with upcoming shows', async () => {
      const mockData = [
        {
          id: '1',
          name: 'Show Dog',
          owner: { first_name: 'John', last_name: 'Doe' }
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

      const result = await getDogsWithUpcomingShows();

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });
  });

  describe('getDogStatistics', () => {
    it('should fetch dog statistics successfully', async () => {
      const mockCount = 42;

      const mockQuery = {
        select: vi.fn().mockResolvedValue({
          error: null,
          count: mockCount
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getDogStatistics();

      expect(result.data).toEqual({ total: mockCount });
      expect(result.error).toBeNull();
      expect(mockQuery.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    });

    it('should handle statistics fetch error', async () => {
      const mockError = { message: 'Statistics unavailable' };

      const mockQuery = {
        select: vi.fn().mockResolvedValue({
          error: mockError,
          count: null
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getDogStatistics();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent requests efficiently', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      
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
      
      // Simulate concurrent requests
      const promises = Array(5).fill(null).map(() => getAllDogs());
      const results = await Promise.all(promises);
      
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // All requests should complete quickly
      expect(results.every(r => r.data.length > 0)).toBe(true);
    });

    it('should validate query performance under load', async () => {
      const mockData = Array(100).fill(null).map((_, i) => ({
        id: `dog-${i}`,
        name: `Dog ${i}`
      }));

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockImplementation(() => 
            new Promise((resolve) => {
              // Simulate database processing time
              setTimeout(() => resolve({
                data: mockData,
                error: null
              }), 100);
            })
          )
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await getAllDogs();
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(100);
      expect(duration).toBeLessThan(200); // Should still be under 200ms
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed response data', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null, // Malformed response
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle undefined error objects', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockRejectedValue(undefined)
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('should handle empty string search terms', async () => {
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

      const result = await searchDogs(searchTerm);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });
});