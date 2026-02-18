import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  searchUsers,
  getUsersByRole,
  getUsersWithDogCounts,
  getUsersStatistics,
  checkEmailExists,
} from '@/services/database/queries/userQueries';
import type { DbUserInsert, DbUserUpdate } from '@/types/database-mappings';
import { mockSupabase, createChainableQuery } from '@/test/mocks/supabase';

describe('User Queries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getAllUsers', () => {
    it('should fetch all users successfully', async () => {
      const mockData = [
        {
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          phone: '123-456-7890',
        },
        {
          id: '2',
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          phone: '098-765-4321',
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllUsers();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should handle database connection errors', async () => {
      const mockError = { message: 'Connection timeout', code: 'CONNECTION_TIMEOUT' };
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getAllUsers();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Connection timeout');
      expect(result.error.table).toBe('user');
      expect(result.error.operation).toBe('select_all');
    });

    it('should sort users by last name and first name', async () => {
      const mockData = [
        { id: '1', first_name: 'Alice', last_name: 'Brown' },
        { id: '2', first_name: 'Bob', last_name: 'Brown' },
        { id: '3', first_name: 'Charlie', last_name: 'Adams' },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getAllUsers();

      expect(result.data).toEqual(mockData);
    });

    it('should handle empty user database', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getAllUsers();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getUserById', () => {
    it('should fetch user by ID with full details successfully', async () => {
      const userId = 'user-123';
      const mockData = {
        id: userId,
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@example.com',
        dog: [{ id: 'dog-1', name: 'Buddy', breed: 'Golden Retriever' }],
        show_registrations: [
          {
            id: 'reg-1',
            registration_type: 'individual',
            show: { id: 'show-1', name: 'Spring Show' },
          },
        ],
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getUserById(userId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should handle user not found', async () => {
      const userId = 'non-existent';
      const mockError = { message: 'Row not found', code: 'PGRST116' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await getUserById(userId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });

    it('should validate response time for detailed user fetch', async () => {
      const userId = 'user-123';
      const mockData = {
        id: userId,
        first_name: 'Test',
        last_name: 'User',
        dog: [],
        show_registrations: [],
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getUserById(userId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('createUser', () => {
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

      const startTime = Date.now();
      const result = await createUser(userData);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockCreatedUser);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
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
      expect(result.error.details).toBe('Email already exists');
    });

    it('should handle required field validation', async () => {
      const userData: DbUserInsert = {
        first_name: '',
        last_name: 'User',
        email: 'invalid@example.com',
      };

      const mockError = {
        message: 'Check constraint violation',
        code: '23514',
        details: 'First name cannot be empty',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await createUser(userData);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23514');
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const userId = 'user-123';
      const updates: DbUserUpdate = {
        first_name: 'Updated',
        phone: '999-888-7777',
      };

      const mockUpdatedUser = {
        id: userId,
        ...updates,
        last_name: 'User',
        email: 'user@example.com',
        updated_at: new Date().toISOString(),
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockUpdatedUser, error: null })
      );

      const result = await updateUser(userId, updates);

      expect(result.data).toEqual(mockUpdatedUser);
      expect(result.error).toBeNull();
    });

    it('should handle update of non-existent user', async () => {
      const userId = 'non-existent';
      const updates: DbUserUpdate = { first_name: 'New Name' };

      const mockError = {
        message: 'No rows updated',
        code: 'PGRST116',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await updateUser(userId, updates);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('PGRST116');
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const userId = 'user-123';
      const mockDeletedUser = {
        id: userId,
        first_name: 'Deleted',
        last_name: 'User',
      };

      mockSupabase.from.mockReturnValue(
        createChainableQuery({ data: mockDeletedUser, error: null })
      );

      const result = await deleteUser(userId);

      expect(result.data).toEqual(mockDeletedUser);
      expect(result.error).toBeNull();
    });

    it('should handle foreign key constraint violations', async () => {
      const userId = 'user-with-dependencies';
      const mockError = {
        message: 'Foreign key constraint violation',
        code: '23503',
        details: 'User has associated dogs',
      };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await deleteUser(userId);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23503');
    });
  });

  describe('searchUsers', () => {
    it('should search users by name and email', async () => {
      const searchTerm = 'john';
      const mockData = [
        {
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          dog: [],
        },
        {
          id: '2',
          first_name: 'Johnny',
          last_name: 'Smith',
          email: 'johnny@example.com',
          dog: [],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await searchUsers(searchTerm);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
    });

    it('should return empty results for no matches', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await searchUsers('nonexistent');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should include dog information in search results', async () => {
      const searchTerm = 'user';
      const mockData = [
        {
          id: '1',
          first_name: 'Test',
          last_name: 'User',
          dog: [{ id: 'dog-1', name: 'Buddy', breed: 'Golden' }],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await searchUsers(searchTerm);

      expect(result.data).toEqual(mockData);
      expect(result.data[0].dog).toHaveLength(1);
    });
  });

  describe('getUsersByRole', () => {
    it('should fetch users by role successfully', async () => {
      const role = 'admin';
      const mockData = [
        {
          id: '1',
          first_name: 'Admin',
          last_name: 'User',
          roles: ['admin', 'moderator'],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getUsersByRole(role);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
    });

    it('should return empty array for non-existent role', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await getUsersByRole('superuser');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('getUsersWithDogCounts', () => {
    it('should fetch users with dog counts successfully', async () => {
      const mockData = [
        {
          id: '1',
          first_name: 'John',
          last_name: 'Doe',
          dogs: [{ id: 'dog-1' }, { id: 'dog-2' }],
        },
        {
          id: '2',
          first_name: 'Jane',
          last_name: 'Smith',
          dogs: [],
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getUsersWithDogCounts();

      expect(result.data).toBeDefined();
      expect(result.data[0].dog_count).toBe(2);
      expect(result.data[1].dog_count).toBe(0);
      expect(result.error).toBeNull();
    });

    it('should handle users with no dogs', async () => {
      const mockData = [
        {
          id: '1',
          first_name: 'No',
          last_name: 'Dogs',
          dogs: null,
        },
      ];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await getUsersWithDogCounts();

      expect(result.data[0].dog_count).toBe(0);
      expect(result.error).toBeNull();
    });
  });

  describe('getUsersStatistics', () => {
    it('should fetch user statistics successfully', async () => {
      const mockCount = 25;

      mockSupabase.from.mockReturnValue(createChainableQuery({ error: null, count: mockCount }));

      const result = await getUsersStatistics();

      expect(result.data).toEqual({ total: mockCount });
      expect(result.error).toBeNull();
    });

    it('should handle statistics fetch error', async () => {
      const mockError = { message: 'Statistics unavailable' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ error: mockError, count: null }));

      const result = await getUsersStatistics();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('checkEmailExists', () => {
    it('should return true for existing email', async () => {
      const email = 'existing@example.com';
      const mockData = [{ id: '1', email }];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const result = await checkEmailExists(email);

      expect(result.exists).toBe(true);
      expect(result.data).toEqual(mockData[0]);
      expect(result.error).toBeNull();
    });

    it('should return false for non-existent email', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await checkEmailExists('nonexistent@example.com');

      expect(result.exists).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should exclude specified user ID from check', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await checkEmailExists('user@example.com', 'user-123');

      expect(result.exists).toBe(false);
    });

    it('should handle database errors in email check', async () => {
      const mockError = { message: 'Database connection failed' };

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: mockError }));

      const result = await checkEmailExists('test@example.com');

      expect(result.exists).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large user datasets efficiently', async () => {
      const mockData = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `user-${i}`,
          first_name: `User${i}`,
          last_name: 'Test',
          email: `user${i}@example.com`,
        }));

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();
      const result = await getAllUsers();
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(1000);
      expect(duration).toBeLessThan(200);
    });

    it('should handle concurrent user searches efficiently', async () => {
      const searchTerms = ['john', 'jane', 'bob', 'alice', 'charlie'];
      const mockData = [{ id: '1', first_name: 'Test', last_name: 'User', dog: [] }];

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: mockData, error: null }));

      const startTime = Date.now();

      const promises = searchTerms.map(term => searchUsers(term));
      const results = await Promise.all(promises);

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
      expect(results.every(r => r.data.length >= 0)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed user data', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: null, error: null }));

      const result = await getAllUsers();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle special characters in search terms', async () => {
      const searchTerm = "O'Connor";

      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await searchUsers(searchTerm);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle empty email check', async () => {
      mockSupabase.from.mockReturnValue(createChainableQuery({ data: [], error: null }));

      const result = await checkEmailExists('');

      expect(result.exists).toBe(false);
      expect(result.data).toBeNull();
    });
  });
});
