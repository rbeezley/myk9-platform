import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  getAllDogs, 
  createDog,
  searchDogs
} from '@/services/database/queries/dogQueries';
import { 
  getAllUsers, 
  createUser
} from '@/services/database/queries/userQueries';
import { 
  getAllShows, 
  createShow
} from '@/services/database/queries/showQueries';
import type { DbDogInsert, DbUserInsert, DbShowInsert } from '@/types/database-mappings';

// Mock the supabase client with a simple, reusable structure
const createMockSupabaseQuery = (data: unknown, error: unknown = null) => ({
  data,
  error
});

const createMockSupabaseBuilder = (response: { data?: unknown; error?: unknown }) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue(response),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  or: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  // For queries that don't use single()
  then: vi.fn((callback) => callback(response))
});

vi.mock('@/services/database/supabaseClient', () => {
  const mockFrom = vi.fn();
  
  return {
    supabase: {
      from: mockFrom
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

describe('Database Queries Integration Tests', () => {
  let mockSupabaseFrom: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { supabase } = await import('@/services/database/supabaseClient');
    mockSupabaseFrom = supabase.from as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Dog Queries', () => {
    it('should fetch all dogs successfully', async () => {
      const mockData = [
        { id: '1', name: 'Buddy', breed: 'Golden Retriever' },
        { id: '2', name: 'Max', breed: 'Labrador' }
      ];

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(mockData)
      );
      
      // Mock the order method specifically to return a resolved value
      mockBuilder.order = vi.fn().mockResolvedValue(createMockSupabaseQuery(mockData));
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const startTime = Date.now();
      const result = await getAllDogs();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200); // Performance validation
      expect(mockSupabaseFrom).toHaveBeenCalledWith('dog');
    });

    it('should handle database connection errors', async () => {
      const mockError = { message: 'Connection failed', code: 'CONNECTION_ERROR' };
      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(null, mockError)
      );
      
      mockBuilder.order = vi.fn().mockResolvedValue(createMockSupabaseQuery(null, mockError));
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Connection failed');
    });

    it('should search dogs efficiently', async () => {
      const searchTerm = 'golden';
      const mockData = [
        { id: '1', name: 'Golden Boy', breed: 'Golden Retriever' }
      ];

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(mockData)
      );
      
      mockBuilder.order = vi.fn().mockResolvedValue(createMockSupabaseQuery(mockData));
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const startTime = Date.now();
      const result = await searchDogs(searchTerm);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockBuilder.or).toHaveBeenCalled();
    });

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
        created_at: new Date().toISOString()
      };

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(mockCreatedDog)
      );
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const result = await createDog(dogData);

      expect(result.data).toEqual(mockCreatedDog);
      expect(result.error).toBeNull();
      expect(mockBuilder.insert).toHaveBeenCalledWith([dogData]);
    });
  });

  describe('User Queries', () => {
    it('should fetch all users successfully', async () => {
      const mockData = [
        { id: '1', first_name: 'John', last_name: 'Doe', email: 'john@example.com' },
        { id: '2', first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com' }
      ];

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(mockData)
      );
      
      // Mock the order chain for users (they have two order calls)
      mockBuilder.order = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue(createMockSupabaseQuery(mockData))
      });
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const startTime = Date.now();
      const result = await getAllUsers();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('user');
    });

    it('should create a new user successfully', async () => {
      const userData: DbUserInsert = {
        first_name: 'New',
        last_name: 'User',
        email: 'new@example.com',
        phone: '555-123-4567'
      };

      const mockCreatedUser = {
        ...userData,
        id: 'new-user-id',
        created_at: new Date().toISOString()
      };

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(mockCreatedUser)
      );
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const result = await createUser(userData);

      expect(result.data).toEqual(mockCreatedUser);
      expect(result.error).toBeNull();
      expect(mockBuilder.insert).toHaveBeenCalledWith([userData]);
    });

    it('should handle email uniqueness constraint violations', async () => {
      const userData: DbUserInsert = {
        first_name: 'Duplicate',
        last_name: 'User',
        email: 'existing@example.com'
      };

      const mockError = { 
        message: 'Unique constraint violation', 
        code: '23505',
        details: 'Email already exists'
      };

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(null, mockError)
      );
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

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
          location: 'Central Park'
        }
      ];

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(mockData)
      );
      
      mockBuilder.order = vi.fn().mockResolvedValue(createMockSupabaseQuery(mockData));
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const startTime = Date.now();
      const result = await getAllShows();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockSupabaseFrom).toHaveBeenCalledWith('show');
    });

    it('should create a new show successfully', async () => {
      const showData: DbShowInsert = {
        name: 'New Championship',
        start_date: '2024-06-01',
        end_date: '2024-06-03',
        location: 'New Venue',
        club_id: 'club-123'
      };

      const mockCreatedShow = {
        ...showData,
        id: 'new-show-id',
        created_at: new Date().toISOString()
      };

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(mockCreatedShow)
      );
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const result = await createShow(showData);

      expect(result.data).toEqual(mockCreatedShow);
      expect(result.error).toBeNull();
      expect(mockBuilder.insert).toHaveBeenCalledWith([showData]);
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent queries efficiently', async () => {
      const mockData = [{ id: '1', name: 'Test' }];
      
      // Create different builders for different query patterns
      const createDogBuilder = () => {
        const builder = createMockSupabaseBuilder(createMockSupabaseQuery(mockData));
        builder.order = vi.fn().mockResolvedValue(createMockSupabaseQuery(mockData));
        return builder;
      };
      
      const createUserBuilder = () => {
        const builder = createMockSupabaseBuilder(createMockSupabaseQuery(mockData));
        builder.order = vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue(createMockSupabaseQuery(mockData))
        });
        return builder;
      };
      
      const createShowBuilder = () => {
        const builder = createMockSupabaseBuilder(createMockSupabaseQuery(mockData));
        builder.order = vi.fn().mockResolvedValue(createMockSupabaseQuery(mockData));
        return builder;
      };

      // Mock different builders based on table name
      mockSupabaseFrom.mockImplementation((table) => {
        switch (table) {
          case 'dog': return createDogBuilder();
          case 'user': return createUserBuilder();
          case 'show': return createShowBuilder();
          default: return createDogBuilder();
        }
      });

      const startTime = Date.now();
      
      // Simulate concurrent requests
      const promises = [
        getAllDogs(),
        getAllUsers(),
        getAllShows()
      ];
      const results = await Promise.all(promises);
      
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(300); // Should complete quickly
      expect(results.every(r => r.error === null)).toBe(true);
    });

    it('should validate query response times under load', async () => {
      const largeDataset = Array(100).fill(null).map((_, i) => ({
        id: `item-${i}`,
        name: `Item ${i}`
      }));

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(largeDataset)
      );
      
      // Simulate processing time
      mockBuilder.order = vi.fn().mockImplementation(() => 
        new Promise((resolve) => {
          setTimeout(() => resolve(createMockSupabaseQuery(largeDataset)), 100);
        })
      );
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const startTime = Date.now();
      const result = await getAllDogs();
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(100);
      expect(duration).toBeLessThan(200); // Should still be under 200ms
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed responses gracefully', async () => {
      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(null) // Malformed response
      );
      
      mockBuilder.order = vi.fn().mockResolvedValue(createMockSupabaseQuery(null));
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle network timeouts', async () => {
      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(null, new Error('Network timeout'))
      );
      
      mockBuilder.order = vi.fn().mockRejectedValue(new Error('Network timeout'));
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const result = await getAllDogs();

      expect(result.data).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Network timeout');
    });

    it('should handle validation errors consistently', async () => {
      const invalidData: DbDogInsert = {
        name: '', // Invalid empty name
        breed: 'Test',
        owner_id: 'owner-123'
      };

      const mockError = { 
        message: 'Validation failed', 
        code: '23514',
        details: 'Name cannot be empty'
      };

      const mockBuilder = createMockSupabaseBuilder(
        createMockSupabaseQuery(null, mockError)
      );
      
      mockSupabaseFrom.mockReturnValue(mockBuilder);

      const result = await createDog(invalidData);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23514');
      expect(result.error.details).toBe('Name cannot be empty');
    });
  });
});