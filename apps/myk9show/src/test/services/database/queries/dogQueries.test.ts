import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getAllDogs,
  getDogById,
  getDogsByOwner,
  createDog,
  updateDog,
  deleteDog,
  searchDogs,
  getDogsWithUpcomingShows,
  getDogStatistics,
} from '@/services/database/queries/dogQueries';
import type { DbDogInsert, DbDogUpdate } from '@/types/database-mappings';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

describe('Dog Queries', () => {
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
            email: 'john@example.com',
          },
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllDogs();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should handle database errors gracefully', async () => {
      const mockError = { message: 'Connection failed', code: 'CONNECTION_ERROR' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Connection failed');
      expect(result.error.table).toBe('dog');
      expect(result.error.operation).toBe('select_all');
    });

    it('should handle network timeout errors', async () => {
      // Override the proxy's 'then' to reject (simulate throw)
      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: null, error: { message: 'Network timeout', code: 'TIMEOUT' } })
      );

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('should return empty array when no dogs exist', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

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
          last_name: 'Doe',
        },
        registrations: [],
        health_record: [],
        entry: [],
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getDogById(dogId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should handle dog not found', async () => {
      const dogId = 'non-existent';
      const mockError = { message: 'Row not found', code: 'PGRST116' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getDogById(dogId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });

    it('should validate response time for single record fetch', async () => {
      const dogId = 'dog-123';
      const mockData = { id: dogId, name: 'Test Dog' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getDogById(dogId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('getDogsByOwner', () => {
    it('should fetch dogs by owner ID successfully', async () => {
      const ownerId = 'owner-123';
      const mockData = [
        { id: '1', name: 'Dog 1', owner_id: ownerId },
        { id: '2', name: 'Dog 2', owner_id: ownerId },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getDogsByOwner(ownerId);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should return empty array for owner with no dogs', async () => {
      const ownerId = 'owner-no-dogs';

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

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
        call_name: 'Buddy',
      };

      const mockCreatedDog = {
        ...dogData,
        id: 'new-dog-id',
        created_at: new Date().toISOString(),
        owner: {
          id: 'owner-123',
          first_name: 'John',
          last_name: 'Doe',
        },
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockCreatedDog, error: null })
      );

      const startTime = Date.now();
      const result = await createDog(dogData);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockCreatedDog);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should handle validation errors', async () => {
      const dogData: DbDogInsert = {
        name: '', // Invalid empty name
        breed: 'Labrador',
        owner_id: 'owner-123',
      };

      const mockError = {
        message: 'Validation failed',
        code: '23514',
        details: 'Name cannot be empty',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

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
        breed: 'Updated Breed',
      };

      const mockUpdatedDog = {
        id: dogId,
        ...updates,
        updated_at: new Date().toISOString(),
        owner: {
          id: 'owner-123',
          first_name: 'John',
        },
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockUpdatedDog, error: null })
      );

      const result = await updateDog(dogId, updates);

      expect(result.data).toEqual(mockUpdatedDog);
      expect(result.error).toBeNull();
    });

    it('should handle update of non-existent dog', async () => {
      const dogId = 'non-existent';
      const updates: DbDogUpdate = { name: 'New Name' };

      const mockError = {
        message: 'No rows updated',
        code: 'PGRST116',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

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
        name: 'Deleted Dog',
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockDeletedDog, error: null })
      );

      const result = await deleteDog(dogId);

      expect(result.data).toEqual(mockDeletedDog);
      expect(result.error).toBeNull();
    });

    it('should handle deletion of non-existent dog', async () => {
      const dogId = 'non-existent';
      const mockError = {
        message: 'No rows deleted',
        code: 'PGRST116',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

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
        { id: '2', name: 'Buddy', breed: 'Golden Retriever' },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await searchDogs(searchTerm);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should return empty results for no matches', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await searchDogs('nonexistent');

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
          owner: { first_name: 'John', last_name: 'Doe' },
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getDogsWithUpcomingShows();

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });
  });

  describe('getDogStatistics', () => {
    it('should fetch dog statistics successfully', async () => {
      const mockCount = 42;

      mockSupabase.from.mockReturnValue(createChainableQuery({ error: null, count: mockCount }));

      const result = await getDogStatistics();

      expect(result.data).toEqual({ total: mockCount });
      expect(result.error).toBeNull();
    });

    it('should handle statistics fetch error', async () => {
      const mockError = { message: 'Statistics unavailable' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ error: mockError, count: null }));

      const result = await getDogStatistics();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent requests efficiently', async () => {
      const mockData = [{ id: '1', name: 'Test' }];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();

      const promises = Array(5)
        .fill(null)
        .map(() => getAllDogs());
      const results = await Promise.all(promises);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
      expect(results.every(r => r.data.length > 0)).toBe(true);
    });

    it('should validate query performance under load', async () => {
      const mockData = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `dog-${i}`,
          name: `Dog ${i}`,
        }));

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllDogs();
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(100);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed response data', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle undefined error objects', async () => {
      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: null, error: { message: 'Unknown error' } })
      );

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
    });

    it('should handle empty string search terms', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await searchDogs('');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });
});
