import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAllDogs, createDog, searchDogs } from '@/services/database/queries/dogQueries';
import { getAllUsers, createUser } from '@/services/database/queries/userQueries';
import { getAllShows, createShow } from '@/services/database/queries/showQueries';
import type { DbDogInsert, DbUserInsert, DbShowInsert } from '@/types/database-mappings';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

const TEST_PERSON_ID = 'test-person-123';

describe('Database Queries Integration Tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Dog Queries', () => {
    it('should fetch all dogs successfully', async () => {
      const mockData = [
        { id: '1', name: 'Buddy', breed: 'Golden Retriever' },
        { id: '2', name: 'Max', breed: 'Labrador' },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllDogs(TEST_PERSON_ID);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockSupabase.from).toHaveBeenCalledWith('dogs');
    });

    it('should handle database connection errors', async () => {
      const mockError = { message: 'Connection failed', code: 'CONNECTION_ERROR' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getAllDogs(TEST_PERSON_ID);

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Connection failed');
    });

    it('should search dogs efficiently', async () => {
      const searchTerm = 'golden';
      const mockData = [{ id: '1', name: 'Golden Boy', breed: 'Golden Retriever' }];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await searchDogs(searchTerm, TEST_PERSON_ID);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

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
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockCreatedDog, error: null })
      );

      const result = await createDog(dogData);

      expect(result.data).toEqual(mockCreatedDog);
      expect(result.error).toBeNull();
    });
  });

  describe('User Queries', () => {
    it('should fetch all users successfully', async () => {
      const mockData = [
        { id: '1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
        { id: '2', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com' },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllUsers();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should create a new user successfully', async () => {
      const userData: DbUserInsert = {
        first_name: 'New',
        last_name: 'User',
        email: 'new@example.com',
        phone: '555-123-4567',
      };

      const mockCreatedUser = {
        ...userData,
        id: 'new-user-id',
        created_at: new Date().toISOString(),
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockCreatedUser, error: null })
      );

      const result = await createUser(userData);

      expect(result.data).toEqual(mockCreatedUser);
      expect(result.error).toBeNull();
    });

    it('should handle email uniqueness constraint violations', async () => {
      const userData: DbUserInsert = {
        first_name: 'Duplicate',
        last_name: 'User',
        email: 'existing@example.com',
      };

      const mockError = {
        message: 'Unique constraint violation',
        code: '23505',
        details: 'Email already exists',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await createUser(userData);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23505');
    });
  });

  describe('Show Queries', () => {
    it('should fetch all shows successfully', async () => {
      const mockData = [
        {
          id: '1',
          name: 'Spring Championship',
          start_date: '2024-04-15',
          location: 'Central Park',
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

    it('should create a new show successfully', async () => {
      const showData: DbShowInsert = {
        name: 'New Championship',
        start_date: '2024-06-01',
        end_date: '2024-06-03',
        location: 'New Venue',
        club_id: 'club-123',
      };

      const mockCreatedShow = {
        ...showData,
        id: 'new-show-id',
        created_at: new Date().toISOString(),
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockCreatedShow, error: null })
      );

      const result = await createShow(showData);

      expect(result.data).toEqual(mockCreatedShow);
      expect(result.error).toBeNull();
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent queries efficiently', async () => {
      const mockData = [{ id: '1', name: 'Test' }];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();

      const promises = [getAllDogs(TEST_PERSON_ID), getAllUsers(), getAllShows()];
      const results = await Promise.all(promises);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300);
      expect(results.every(r => r.error === null)).toBe(true);
    });

    it('should validate query response times under load', async () => {
      const largeDataset = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `item-${i}`,
          name: `Item ${i}`,
        }));

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: largeDataset, error: null }));

      const startTime = Date.now();
      const result = await getAllDogs(TEST_PERSON_ID);
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(100);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed responses gracefully', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await getAllDogs(TEST_PERSON_ID);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle network timeouts', async () => {
      const mockError = { message: 'Network timeout', code: 'TIMEOUT' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getAllDogs(TEST_PERSON_ID);

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Network timeout');
    });

    it('should handle validation errors consistently', async () => {
      const invalidData: DbDogInsert = {
        name: '',
        breed: 'Test',
        owner_id: 'owner-123',
      };

      const mockError = {
        message: 'Validation failed',
        code: '23514',
        details: 'Name cannot be empty',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await createDog(invalidData);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23514');
      expect(result.error.details).toBe('Name cannot be empty');
    });
  });
});
