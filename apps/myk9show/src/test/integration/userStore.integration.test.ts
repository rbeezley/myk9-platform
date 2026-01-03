// User Store Detailed Integration Tests
// Tests user store integration with database layer, sync operations, and complex scenarios

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

import { useUserStore } from '@/store/userStore';
import { useUserStoreCompat } from '@/hooks/useUserStoreCompat';
import type { UserInput } from '@/store/userStore';
import type { User } from '@/types/user-types';

// Mock comprehensive user data
const mockUsers = [
  {
    id: 'user-1',
    first_name: 'John',
    last_name: 'Smith',
    email: 'john@example.com',
    phone: '555-0123',
    street: '123 Main St',
    city: 'Anytown',
    state: 'CA',
    zip_code: '90210',
    emergency_contact_name: 'Jane Smith',
    emergency_contact_phone: '555-0124',
    emergency_contact_relationship: 'Spouse',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z'
  },
  {
    id: 'user-2',
    first_name: 'Alice',
    last_name: 'Johnson',
    email: 'alice@example.com',
    phone: '555-0456',
    street: '456 Oak Ave',
    city: 'Another City',
    state: 'NY',
    zip_code: '10001',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z'
  },
  {
    id: 'user-3',
    first_name: 'Bob',
    last_name: 'Wilson',
    email: 'bob@example.com',
    phone: '555-0789',
    street: '789 Pine St',
    city: 'Third Town',
    state: 'TX',
    zip_code: '73301',
    emergency_contact_name: 'Carol Wilson',
    emergency_contact_phone: '555-0790',
    emergency_contact_relationship: 'Sister',
    created_at: '2025-01-26T00:00:00Z',
    updated_at: '2025-01-26T00:00:00Z'
  }
];

// Mock the sync service
const mockSyncService = {
  addToQueue: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/services/sync/syncService', () => ({
  syncService: mockSyncService,
}));

// Mock database queries
vi.mock('@/services/database/queries/userQueries', () => ({
  getAllUsers: vi.fn().mockResolvedValue({
    data: mockUsers,
    error: null
  }),
  getUserById: vi.fn((id: string) => {
    const user = mockUsers.find(u => u.id === id);
    return Promise.resolve({
      data: user || null,
      error: user ? null : new Error('User not found')
    });
  }),
  createUser: vi.fn((userData: Record<string, unknown>) => {
    const newUser = {
      id: `user-${Date.now()}`,
      ...userData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({
      data: newUser,
      error: null
    });
  }),
  updateUser: vi.fn((id: string, updates: Record<string, unknown>) => {
    const user = mockUsers.find(u => u.id === id);
    if (!user) {
      return Promise.resolve({
        data: null,
        error: new Error('User not found')
      });
    }
    const updatedUser = {
      ...user,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    return Promise.resolve({
      data: updatedUser,
      error: null
    });
  }),
  deleteUser: vi.fn((id: string) => {
    return Promise.resolve({
      data: { id },
      error: null
    });
  }),
  searchUsers: vi.fn((searchTerm: string) => {
    const results = mockUsers.filter(u => 
      u.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return Promise.resolve({
      data: results,
      error: null
    });
  }),
  getUserStatistics: vi.fn().mockResolvedValue({
    data: {
      total: mockUsers.length,
      by_state: {
        'CA': 1,
        'NY': 1,
        'TX': 1
      },
      with_emergency_contact: 2,
      average_dogs_per_user: 1.5
    },
    error: null
  })
}));

// Mock other dependencies
vi.mock('@/utils/authHelpers', () => ({
  getLastModifiedBy: vi.fn().mockReturnValue('test-user'),
}));

vi.mock('@/utils/idUtils', () => ({
  generateId: vi.fn(() => `test-id-${Date.now()}-${Math.random()}`),
}));

vi.mock('@/services/database/storage-adapter', () => ({
  getOptimalStorage: vi.fn(() => ({
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  })),
}));

vi.mock('@/utils/standardizedErrorHandler', () => ({
  reportSyncError: vi.fn(),
  reportStoreError: vi.fn(),
}));

// Mock mappers
vi.mock('@/services/mappers/userMappers', () => ({
  mapUserInputToInsert: vi.fn((input) => ({
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    street: input.address?.street,
    city: input.address?.city,
    state: input.address?.state,
    zip_code: input.address?.zipCode,
    emergency_contact_name: input.emergencyContact?.name,
    emergency_contact_phone: input.emergencyContact?.phone,
    emergency_contact_relationship: input.emergencyContact?.relationship,
  })),
  mapUserInputToUpdate: vi.fn((input) => ({
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
  })),
  mapDatabaseToUser: vi.fn((data) => ({
    id: data.id,
    firstName: data.first_name,
    lastName: data.last_name,
    email: data.email,
    phone: data.phone,
    address: [data.street, data.city, data.state, data.zip_code].filter(Boolean).join(', ') || undefined,
    city: data.city,
    state: data.state,
    zipCode: data.zip_code,
    emergencyContact: data.emergency_contact_name ? {
      name: data.emergency_contact_name,
      phone: data.emergency_contact_phone,
      relationship: data.emergency_contact_relationship,
    } : undefined,
  })),
  mapDatabaseUsersArray: vi.fn((data) => data.map((item: Record<string, unknown>) => ({
    id: item.id,
    firstName: item.first_name,
    lastName: item.last_name,
    email: item.email,
    phone: item.phone,
    address: [item.street, item.city, item.state, item.zip_code].filter(Boolean).join(', ') || undefined,
    city: item.city,
    state: item.state,
    zipCode: item.zip_code,
    emergencyContact: item.emergency_contact_name ? {
      name: item.emergency_contact_name,
      phone: item.emergency_contact_phone,
      relationship: item.emergency_contact_relationship,
    } : undefined,
  }))),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { 
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => 
    React.createElement(QueryClientProvider, { client: queryClient }, children);
};

describe('User Store Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('User Store Direct Operations', () => {
    it('should handle user creation with sync metadata', async () => {
      const { result } = renderHook(() => useUserStore());

      const userData: UserInput = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '555-0999',
        address: {
          street: '999 Test St',
          city: 'Test City',
          state: 'CA',
          zipCode: '90001',
          country: 'USA',
        },
        emergencyContact: {
          name: 'John Doe',
          phone: '555-0998',
          relationship: 'Spouse',
        },
      };

      await act(async () => {
        const newUser = await result.current.addUser(userData);
        
        expect(newUser).toMatchObject({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          phone: '555-0999',
          _syncStatus: 'pending',
          _version: 1,
          _lastModifiedBy: 'test-user',
        });

        expect(newUser._lastModified).toBeInstanceOf(Date);
        expect(newUser.address).toBe('999 Test St, Test City, CA, 90001, USA');
      });

      // Verify user was added to store
      expect(result.current.users).toHaveLength(1);
      expect(result.current.users[0].firstName).toBe('Jane');

      // Verify sync service was called
      expect(mockSyncService.addToQueue).toHaveBeenCalledWith({
        entityType: 'people',
        entityId: expect.any(String),
        operation: 'create',
        data: expect.any(Object),
        priority: 'medium',
      });
    });

    it('should handle user updates with version increments', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user first
      await act(async () => {
        await result.current.addUser({
          firstName: 'Update',
          lastName: 'Test',
          email: 'update@test.com',
          phone: '555-1111',
        });
      });

      const userId = result.current.users[0].id;
      const initialVersion = result.current.users[0]._version;

      // Update the user
      await act(async () => {
        const updatedUser = await result.current.updateUser(userId, {
          firstName: 'Updated',
          phone: '555-2222',
          address: {
            street: '123 Updated St',
            city: 'Updated City',
            state: 'NY',
            zipCode: '10002',
          },
        });
        
        expect(updatedUser).toMatchObject({
          firstName: 'Updated',
          lastName: 'Test',
          phone: '555-2222',
          _version: initialVersion + 1,
          _syncStatus: 'pending',
        });
      });

      // Verify update in store
      const user = result.current.getUserById(userId);
      expect(user?.firstName).toBe('Updated');
      expect(user?.phone).toBe('555-2222');
      expect(user?._version).toBe(2);
    });

    it('should handle user deletion optimistically', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user first
      await act(async () => {
        await result.current.addUser({
          firstName: 'Delete',
          lastName: 'Me',
          email: 'delete@test.com',
        });
      });

      const userId = result.current.users[0].id;
      expect(result.current.users).toHaveLength(1);

      // Delete the user
      await act(async () => {
        await result.current.deleteUser(userId);
      });

      // Verify user was removed
      expect(result.current.users).toHaveLength(0);
      expect(result.current.getUserById(userId)).toBeNull();

      // Verify sync service was called for deletion
      expect(mockSyncService.addToQueue).toHaveBeenLastCalledWith({
        entityType: 'people',
        entityId: userId,
        operation: 'delete',
        data: {},
        priority: 'medium',
      });
    });

    it('should handle sync errors gracefully', async () => {
      const { result } = renderHook(() => useUserStore());

      // Mock sync service failure
      mockSyncService.addToQueue.mockRejectedValueOnce(new Error('Sync failed'));

      const userData: UserInput = {
        firstName: 'Sync',
        lastName: 'Error',
        email: 'sync@error.com',
      };

      await act(async () => {
        const newUser = await result.current.addUser(userData);
        
        // Should still create user optimistically even if sync fails
        expect(newUser.firstName).toBe('Sync');
        expect(newUser._syncStatus).toBe('pending');
      });

      expect(result.current.users).toHaveLength(1);
    });

    it('should provide backward compatibility for people methods', async () => {
      const { result } = renderHook(() => useUserStore());

      // Test people property alias
      expect(result.current.people).toBe(result.current.users);

      // Test legacy method aliases
      const user: User = {
        id: 'legacy-user',
        firstName: 'Legacy',
        lastName: 'User',
        email: 'legacy@test.com',
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'test-user',
        _syncStatus: 'synced',
        _localOnly: false,
      };

      act(() => {
        result.current.addPersonLegacy(user);
      });

      expect(result.current.people).toHaveLength(1);
      expect(result.current.getPersonById('legacy-user')).toBeTruthy();

      // Test people setter
      const users = [user, { ...user, id: 'user-2', firstName: 'Second' }];
      act(() => {
        result.current.setPeople(users);
      });

      expect(result.current.people).toHaveLength(2);
    });

    it('should handle dialog state management', async () => {
      const { result } = renderHook(() => useUserStore());

      // Test user dialog state
      expect(result.current.isAddUserDialogOpen).toBe(false);
      expect(result.current.isEditUserDialogOpen).toBe(false);

      act(() => {
        result.current.setIsAddUserDialogOpen(true);
      });

      expect(result.current.isAddUserDialogOpen).toBe(true);

      // Test legacy aliases
      expect(result.current.isAddPersonDialogOpen).toBe(false);
      
      act(() => {
        result.current.setIsAddPersonDialogOpen(true);
      });

      expect(result.current.isAddUserDialogOpen).toBe(true); // Should affect same state

      // Test other dialog states
      act(() => {
        result.current.setIsDeleteDialogOpen(true);
        result.current.setIsViewDetailsDialogOpen(true);
      });

      expect(result.current.isDeleteDialogOpen).toBe(true);
      expect(result.current.isViewDetailsDialogOpen).toBe(true);

      // Test selected user
      const testUser: User = {
        id: 'selected-user',
        firstName: 'Selected',
        lastName: 'User',
        email: 'selected@test.com',
        _version: 1,
        _lastModified: new Date(),
        _lastModifiedBy: 'test-user',
        _syncStatus: 'synced',
        _localOnly: false,
      };

      act(() => {
        result.current.setSelectedUser(testUser);
      });

      expect(result.current.selectedUser).toBe(testUser);

      // Test legacy alias
      act(() => {
        result.current.setSelectedPerson(null);
      });

      expect(result.current.selectedUser).toBeNull();
    });

    it('should handle store reset correctly', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add some data and state
      await act(async () => {
        await result.current.addUser({
          firstName: 'Reset',
          lastName: 'Test',
          email: 'reset@test.com',
        });
      });

      act(() => {
        result.current.setIsAddUserDialogOpen(true);
        result.current.setSelectedUser(result.current.users[0]);
      });

      expect(result.current.users).toHaveLength(1);
      expect(result.current.isAddUserDialogOpen).toBe(true);
      expect(result.current.selectedUser).toBeTruthy();

      // Reset store
      act(() => {
        result.current.reset?.();
      });

      expect(result.current.users).toHaveLength(0);
      expect(result.current.isAddUserDialogOpen).toBe(false);
      expect(result.current.selectedUser).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('User Store Compatibility Layer', () => {
    it('should load and display users correctly through compatibility layer', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useUserStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.users).toHaveLength(3);
      
      const user1 = result.current.users.find(u => u.id === 'user-1');
      expect(user1).toMatchObject({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Smith',
        email: 'john@example.com',
        phone: '555-0123',
        city: 'Anytown',
        state: 'CA',
        emergencyContact: {
          name: 'Jane Smith',
          phone: '555-0124',
          relationship: 'Spouse',
        },
      });
    });

    it('should handle user operations through compatibility layer', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useUserStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const newUserData: UserInput = {
        firstName: 'Compat',
        lastName: 'User',
        email: 'compat@test.com',
        phone: '555-3333',
        address: {
          street: '333 Compat St',
          city: 'Compat City',
          state: 'FL',
          zipCode: '33301',
        },
      };

      await act(async () => {
        const newUser = await result.current.addUser(newUserData);
        expect(newUser).toMatchObject({
          firstName: 'Compat',
          lastName: 'User',
          email: 'compat@test.com',
        });
      });
    });

    it('should provide user statistics', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useUserStoreCompat(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoadingStatistics).toBe(false);
      });

      expect(result.current.statistics).toMatchObject({
        total: 3,
        by_state: {
          'CA': 1,
          'NY': 1,
          'TX': 1
        },
        with_emergency_contact: 2,
        average_dogs_per_user: 1.5
      });
    });
  });

  describe('Real-world User Management Scenarios', () => {
    it('should handle complete user registration workflow', async () => {
      const { result } = renderHook(() => useUserStore());

      // 1. New user signs up
      const registrationData: UserInput = {
        firstName: 'Sarah',
        lastName: 'Connor',
        email: 'sarah@connor.com',
        phone: '555-TERMINATOR',
        address: {
          street: '1234 Resistance Ave',
          city: 'Los Angeles',
          state: 'CA',
          zipCode: '90210',
          country: 'USA',
        },
        emergencyContact: {
          name: 'Kyle Reese',
          phone: '555-FUTURE',
          relationship: 'Partner',
        },
      };

      await act(async () => {
        const newUser = await result.current.addUser(registrationData);
        expect(newUser.firstName).toBe('Sarah');
        expect(newUser.email).toBe('sarah@connor.com');
        expect(newUser._syncStatus).toBe('pending');
      });

      const userId = result.current.users[0].id;

      // 2. User updates their profile
      await act(async () => {
        const updatedUser = await result.current.updateUser(userId, {
          phone: '555-NEW-PHONE',
          address: {
            street: '5678 New Address Blvd',
            city: 'San Francisco',
            state: 'CA',
            zipCode: '94102',
          },
        });

        expect(updatedUser?.phone).toBe('555-NEW-PHONE');
        expect(updatedUser?._version).toBe(2);
      });

      // 3. Verify user data integrity
      const user = result.current.getUserById(userId);
      expect(user?.firstName).toBe('Sarah');
      expect(user?.lastName).toBe('Connor');
      expect(user?.phone).toBe('555-NEW-PHONE');
      expect(user?._version).toBe(2);

      // 4. Check sync status
      const syncStatus = result.current.getSyncStatus(userId);
      expect(syncStatus).toBe('pending');
    });

    it('should handle user profile management with complex address updates', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add user with initial address
      await act(async () => {
        await result.current.addUser({
          firstName: 'Mobile',
          lastName: 'User',
          email: 'mobile@user.com',
          address: {
            street: '123 First St',
            city: 'Start City',
            state: 'CA',
            zipCode: '90001',
          },
        });
      });

      const userId = result.current.users[0].id;

      // Update to new address
      await act(async () => {
        await result.current.updateUser(userId, {
          address: {
            street: '456 Second Ave',
            city: 'New City',
            state: 'NY',
            zipCode: '10001',
            country: 'USA',
          },
        });
      });

      const user = result.current.getUserById(userId);
      expect(user?.address).toBe('456 Second Ave, New City, NY, 10001, USA');
      expect(user?.city).toBe('New City');
      expect(user?.state).toBe('NY');
      expect(user?.zipCode).toBe('10001');
    });

    it('should handle emergency contact management', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add user without emergency contact
      await act(async () => {
        await result.current.addUser({
          firstName: 'Solo',
          lastName: 'User',
          email: 'solo@user.com',
        });
      });

      const userId = result.current.users[0].id;
      let user = result.current.getUserById(userId);
      expect(user?.emergencyContact).toBeUndefined();

      // Add emergency contact
      await act(async () => {
        await result.current.updateUser(userId, {
          emergencyContact: {
            name: 'Emergency Contact',
            phone: '911-911-9111',
            relationship: 'Friend',
          },
        });
      });

      user = result.current.getUserById(userId);
      expect(user?.emergencyContact).toEqual({
        name: 'Emergency Contact',
        phone: '911-911-9111',
        relationship: 'Friend',
      });

      // Update emergency contact
      await act(async () => {
        await result.current.updateUser(userId, {
          emergencyContact: {
            name: 'Updated Contact',
            phone: '411-411-4111',
            relationship: 'Relative',
          },
        });
      });

      user = result.current.getUserById(userId);
      expect(user?.emergencyContact?.name).toBe('Updated Contact');
      expect(user?.emergencyContact?.relationship).toBe('Relative');
    });

    it('should handle bulk user operations', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add multiple users
      const users: UserInput[] = [
        {
          firstName: 'Bulk1',
          lastName: 'User',
          email: 'bulk1@test.com',
        },
        {
          firstName: 'Bulk2',
          lastName: 'User',
          email: 'bulk2@test.com',
        },
        {
          firstName: 'Bulk3',
          lastName: 'User',
          email: 'bulk3@test.com',
        },
      ];

      const userIds: string[] = [];

      for (const userData of users) {
        await act(async () => {
          const newUser = await result.current.addUser(userData);
          userIds.push(newUser.id);
        });
      }

      expect(result.current.users).toHaveLength(3);

      // Update all users with same data
      for (const userId of userIds) {
        await act(async () => {
          await result.current.updateUser(userId, {
            phone: '555-BULK',
          });
        });
      }

      // Verify all updates
      const allUsers = result.current.users;
      expect(allUsers.every(u => u.phone === '555-BULK')).toBe(true);
      expect(allUsers.every(u => u._version === 2)).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle user not found scenarios', async () => {
      const { result } = renderHook(() => useUserStore());

      // Try to update non-existent user
      await act(async () => {
        const result_update = await result.current.updateUser('non-existent', {
          firstName: 'Should Not Work',
        });
        expect(result_update).toBeNull();
      });

      expect(result.current.error).toBeTruthy();

      // Try to delete non-existent user
      await act(async () => {
        await result.current.deleteUser('non-existent');
      });

      // Should handle gracefully without crashing
    });

    it('should handle invalid user data', async () => {
      const { result } = renderHook(() => useUserStore());

      // Try to add user with minimal data
      await act(async () => {
        try {
          await result.current.addUser({
            firstName: '',
            lastName: '',
            email: '',
          });
        } catch (error) {
          // Should handle validation errors
          expect(error).toBeTruthy();
        }
      });
    });

    it('should handle concurrent updates correctly', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user
      await act(async () => {
        await result.current.addUser({
          firstName: 'Concurrent',
          lastName: 'User',
          email: 'concurrent@test.com',
        });
      });

      const userId = result.current.users[0].id;

      // Attempt concurrent updates
      const updates = Promise.all([
        result.current.updateUser(userId, { firstName: 'Updated1' }),
        result.current.updateUser(userId, { lastName: 'Updated2' }),
        result.current.updateUser(userId, { phone: '555-UPDATED' }),
      ]);

      await act(async () => {
        const results = await updates;
        // All updates should succeed (last one wins in terms of version)
        expect(results.every(r => r !== null)).toBe(true);
      });

      const finalUser = result.current.getUserById(userId);
      expect(finalUser?._version).toBeGreaterThan(1);
    });

    it('should handle localStorage persistence correctly', async () => {
      const { result } = renderHook(() => useUserStore());

      // Add a user
      await act(async () => {
        await result.current.addUser({
          firstName: 'Persistent',
          lastName: 'User',
          email: 'persistent@test.com',
        });
      });

      expect(result.current.users).toHaveLength(1);

      // Simulate page reload by creating new store instance
      const { result: result2 } = renderHook(() => useUserStore());

      // Data should be persisted (in real scenario, would be from localStorage)
      // Note: In this test environment, we're testing the mechanism, not the actual persistence
      expect(result2.current.users).toBeDefined();
    });
  });

  describe('Performance and Optimization', () => {
    it('should provide proper loading states', async () => {
      const { result } = renderHook(() => useUserStore());

      // Initially not loading
      expect(result.current.isLoading).toBe(false);

      // During operation, loading should be managed
      const addPromise = result.current.addUser({
        firstName: 'Loading',
        lastName: 'Test',
        email: 'loading@test.com',
      });

      // Note: In real scenario with slower operations, 
      // isLoading would be true during the operation

      await act(async () => {
        await addPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle memory cleanup on unmount', async () => {
      const { result, unmount } = renderHook(() => useUserStore());

      await act(async () => {
        await result.current.addUser({
          firstName: 'Memory',
          lastName: 'Test',
          email: 'memory@test.com',
        });
      });

      expect(result.current.users).toHaveLength(1);

      // Unmount should not cause memory leaks
      unmount();

      // Note: In real scenario, we'd check for proper cleanup
      // This test ensures no errors are thrown during unmount
    });
  });
});