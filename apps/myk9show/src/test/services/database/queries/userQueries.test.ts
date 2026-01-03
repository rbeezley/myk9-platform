import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  checkEmailExists
} from '@/services/database/queries/userQueries';
import type { DbUserInsert, DbUserUpdate } from '@/types/database-mappings';

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

describe('User Queries', () => {
  let mockSupabaseFrom: ReturnType<typeof vi.fn>;

  // Helper function to create mock query chains
  // const createMockQuery = (mockData: Record<string, unknown>, mockError: Record<string, unknown> | null = null) => {
  //   const mocks = {
  //     select: vi.fn(),
  //     eq: vi.fn(),
  //     neq: vi.fn(),
  //     or: vi.fn(),
  //     contains: vi.fn(),
  //     order: vi.fn(),
  //     insert: vi.fn(),
  //     update: vi.fn(),
  //     delete: vi.fn(),
  //     single: vi.fn(),
  //   };

  //   // Chain the mocks - each method returns an object with the next methods
  //   const result = { data: mockData, error: mockError };
    
  //   mocks.single.mockResolvedValue(result);
  //   mocks.order.mockReturnValue({ order: vi.fn().mockResolvedValue(result) });
  //   mocks.eq.mockReturnValue({ single: mocks.single });
  //   mocks.neq.mockReturnValue({ eq: mocks.eq });
  //   mocks.or.mockReturnValue({ select: mocks.select });
  //   mocks.contains.mockReturnValue(mocks);
  //   mocks.select.mockReturnValue({ 
  //     eq: mocks.eq,
  //     or: mocks.or,
  //     order: mocks.order,
  //     contains: mocks.contains
  //   });
  //   mocks.insert.mockReturnValue({ select: mocks.select });
  //   mocks.update.mockReturnValue({ eq: mocks.eq, select: mocks.select });
  //   mocks.delete.mockReturnValue({ eq: mocks.eq });

  //   return mocks;
  // };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Get the mocked supabase client
    const { supabase } = await import('@/services/database/supabaseClient');
    mockSupabaseFrom = supabase.from as ReturnType<typeof vi.fn>;
  });

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
          phone: '123-456-7890'
        },
        {
          id: '2',
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          phone: '098-765-4321'
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockData,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await getAllUsers();
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200); // Response time validation
      expect(mockSupabaseFrom).toHaveBeenCalledWith('user');
      expect(mockQuery.select).toHaveBeenCalledWith('*');
    });

    it('should handle database connection errors', async () => {
      const mockError = { message: 'Connection timeout', code: 'CONNECTION_TIMEOUT' };
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: mockError
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
        { id: '3', first_name: 'Charlie', last_name: 'Adams' }
      ];

      const mockOrderFn = vi.fn();
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockImplementation((field, options) => {
            mockOrderFn(field, options);
            return {
              order: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            };
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllUsers();

      expect(result.data).toEqual(mockData);
      expect(mockOrderFn).toHaveBeenCalledWith('last_name', { ascending: true });
    });

    it('should handle empty user database', async () => {
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
        dog: [
          { id: 'dog-1', name: 'Buddy', breed: 'Golden Retriever' }
        ],
        show_registrations: [
          {
            id: 'reg-1',
            registration_type: 'individual',
            show: { id: 'show-1', name: 'Spring Show' }
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
      const result = await getUserById(userId);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('dog('));
      // Note: eq is called on the result of select(), not directly on mockQuery
    });

    it('should handle user not found', async () => {
      const userId = 'non-existent';
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
        show_registrations: []
      };

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockImplementation(() => 
              new Promise((resolve) => {
                setTimeout(() => resolve({ data: mockData, error: null }), 75);
              })
            )
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
        phone: '555-123-4567'
      };

      const mockCreatedUser = {
        ...userData,
        id: 'new-user-id',
        created_at: new Date().toISOString()
      };

      const mockQuery = {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCreatedUser,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await createUser(userData);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockCreatedUser);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockQuery.insert).toHaveBeenCalledWith([userData]);
    });

    it('should handle email uniqueness constraint violations', async () => {
      const userData: DbUserInsert = {
        first_name: 'Duplicate',
        last_name: 'User',
        email: 'existing@example.com' // Email already exists
      };

      const mockError = { 
        message: 'Unique constraint violation', 
        code: '23505',
        details: 'Email already exists'
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

      const result = await createUser(userData);

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('23505');
      expect(result.error.details).toBe('Email already exists');
    });

    it('should handle required field validation', async () => {
      const userData: DbUserInsert = {
        first_name: '',  // Invalid empty name
        last_name: 'User',
        email: 'invalid@example.com'
      };

      const mockError = { 
        message: 'Check constraint violation', 
        code: '23514',
        details: 'First name cannot be empty'
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
        phone: '999-888-7777'
      };

      const mockUpdatedUser = {
        id: userId,
        ...updates,
        last_name: 'User',
        email: 'user@example.com',
        updated_at: new Date().toISOString()
      };

      const mockQuery = {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockUpdatedUser,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await updateUser(userId, updates);

      expect(result.data).toEqual(mockUpdatedUser);
      expect(result.error).toBeNull();
      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String)
        })
      );
      expect(mockQuery.eq).toHaveBeenCalledWith('id', userId);
    });

    it('should handle update of non-existent user', async () => {
      const userId = 'non-existent';
      const updates: DbUserUpdate = { first_name: 'New Name' };

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
        last_name: 'User'
      };

      const mockQuery = {
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockDeletedUser,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await deleteUser(userId);

      expect(result.data).toEqual(mockDeletedUser);
      expect(result.error).toBeNull();
      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockQuery.eq).toHaveBeenCalledWith('id', userId);
    });

    it('should handle foreign key constraint violations', async () => {
      const userId = 'user-with-dependencies';
      const mockError = { 
        message: 'Foreign key constraint violation', 
        code: '23503',
        details: 'User has associated dogs'
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
          dog: []
        },
        { 
          id: '2', 
          first_name: 'Johnny', 
          last_name: 'Smith', 
          email: 'johnny@example.com',
          dog: []
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await searchUsers(searchTerm);
      const duration = Date.now() - startTime;

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(duration).toBeLessThan(200);
      expect(mockQuery.or).toHaveBeenCalledWith(
        expect.stringContaining(`first_name.ilike.%${searchTerm}%`)
      );
    });

    it('should return empty results for no matches', async () => {
      const searchTerm = 'nonexistent';
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await searchUsers(searchTerm);

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
          dog: [
            { id: 'dog-1', name: 'Buddy', breed: 'Golden' }
          ]
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await searchUsers(searchTerm);

      expect(result.data).toEqual(mockData);
      expect(result.data[0].dog).toHaveLength(1);
      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('dog('));
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
          roles: ['admin', 'moderator']
        }
      ];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          contains: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockData,
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getUsersByRole(role);

      expect(result.data).toEqual(mockData);
      expect(result.error).toBeNull();
      expect(mockQuery.contains).toHaveBeenCalledWith('roles', [role]);
    });

    it('should return empty array for non-existent role', async () => {
      const role = 'superuser';
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          contains: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getUsersByRole(role);

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
          dog: [
            { id: 'dog-1' },
            { id: 'dog-2' }
          ]
        },
        {
          id: '2',
          first_name: 'Jane',
          last_name: 'Smith',
          dog: []
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
          dog: null // null instead of empty array
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

      const result = await getUsersWithDogCounts();

      expect(result.data[0].dog_count).toBe(0);
      expect(result.error).toBeNull();
    });
  });

  describe('getUsersStatistics', () => {
    it('should fetch user statistics successfully', async () => {
      const mockCount = 25;

      const mockQuery = {
        select: vi.fn().mockResolvedValue({
          error: null,
          count: mockCount
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getUsersStatistics();

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

      const result = await getUsersStatistics();

      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('checkEmailExists', () => {
    it('should return true for existing email', async () => {
      const email = 'existing@example.com';
      const mockData = [{ id: '1', email }];

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: mockData,
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await checkEmailExists(email);

      expect(result.exists).toBe(true);
      expect(result.data).toEqual(mockData[0]);
      expect(result.error).toBeNull();
      expect(mockQuery.eq).toHaveBeenCalledWith('email', email);
    });

    it('should return false for non-existent email', async () => {
      const email = 'nonexistent@example.com';

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await checkEmailExists(email);

      expect(result.exists).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('should exclude specified user ID from check', async () => {
      const email = 'user@example.com';
      const excludeId = 'user-123';

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            neq: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await checkEmailExists(email, excludeId);

      expect(result.exists).toBe(false);
      expect(mockQuery.neq).toHaveBeenCalledWith('id', excludeId);
    });

    it('should handle database errors in email check', async () => {
      const email = 'test@example.com';
      const mockError = { message: 'Database connection failed' };

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: mockError
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await checkEmailExists(email);

      expect(result.exists).toBe(false);
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle large user datasets efficiently', async () => {
      const mockData = Array(1000).fill(null).map((_, i) => ({
        id: `user-${i}`,
        first_name: `User${i}`,
        last_name: 'Test',
        email: `user${i}@example.com`
      }));

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockImplementation(() => 
              new Promise((resolve) => {
                setTimeout(() => resolve({
                  data: mockData,
                  error: null
                }), 150);
              })
            )
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const startTime = Date.now();
      const result = await getAllUsers();
      const duration = Date.now() - startTime;

      expect(result.data).toHaveLength(1000);
      expect(duration).toBeLessThan(200);
    });

    it('should handle concurrent user searches efficiently', async () => {
      const searchTerms = ['john', 'jane', 'bob', 'alice', 'charlie'];
      const mockData = [{ id: '1', first_name: 'Test', last_name: 'User', dog: [] }];
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockData,
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

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
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null, // Malformed response
              error: null
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await getAllUsers();

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('should handle special characters in search terms', async () => {
      const searchTerm = "O'Connor";
      
      const mockQuery = {
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await searchUsers(searchTerm);

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
      expect(mockQuery.or).toHaveBeenCalledWith(
        expect.stringContaining(searchTerm)
      );
    });

    it('should handle empty email check', async () => {
      const email = '';

      const mockQuery = {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [],
            error: null
          })
        })
      };

      mockSupabaseFrom.mockReturnValue(mockQuery);

      const result = await checkEmailExists(email);

      expect(result.exists).toBe(false);
      expect(result.data).toBeNull();
    });
  });
});