import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUserStore } from '@/store/userStore';
import { useUserStoreCompat } from '@/hooks/useUserStoreCompat';
import { resetFactories } from '@/test/utils/factories';
import type { UserInput } from '@/store/userStore';
import type { User } from '@/types/dog-types';
import React from 'react';

// Mock data for testing
const mockUsers: User[] = [
  {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '555-0123',
    name: 'John Doe',
    address: '123 Main St',
    city: 'Anytown',
    state: 'CA',
    zipCode: '12345',
    streetAddress: '123 Main St',
    associatedDogs: [],
    dogs: [],
    emergencyContact: {
      name: 'Jane Doe',
      phone: '555-0124',
      relationship: 'Spouse'
    },
    roles: ['exhibitor'],
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  }
];

// Mock the database hooks
const mockUseUsersQuery = vi.fn();
const mockUseCreateUserMutation = vi.fn();
const mockUseUpdateUserMutation = vi.fn();
const mockUseDeleteUserMutation = vi.fn();
const mockUseUserStatisticsQuery = vi.fn();
const mockUseUserQuery = vi.fn();
const mockUseUsersWithDogCountsQuery = vi.fn();
const mockUseUsersSearchQuery = vi.fn();
const mockUseUsersByRoleQuery = vi.fn();

vi.mock('@/hooks/queries/useUsersDatabase', () => ({
  useUsersQuery: () => mockUseUsersQuery(),
  useUserQuery: () => mockUseUserQuery(),
  useUsersWithDogCountsQuery: () => mockUseUsersWithDogCountsQuery(),
  useUsersSearchQuery: () => mockUseUsersSearchQuery(),
  useUsersByRoleQuery: () => mockUseUsersByRoleQuery(),
  useCreateUserMutation: () => mockUseCreateUserMutation(),
  useUpdateUserMutation: () => mockUseUpdateUserMutation(),
  useDeleteUserMutation: () => mockUseDeleteUserMutation(),
  useUserStatisticsQuery: () => mockUseUserStatisticsQuery(),
}));

// Mock the mappers
vi.mock('@/services/mappers/userMappers', () => ({
  mapUserInputToInsert: vi.fn((input) => ({ ...input, id: `db-${Date.now()}` })),
  mapUserInputToUpdate: vi.fn((input) => ({ ...input })),
  mapDatabaseToUser: vi.fn((dbUser) => ({ ...dbUser })),
  mapDatabaseUsersArray: vi.fn((dbUsers) => dbUsers || []),
}));

// Test wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('userStore (with database integration)', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Reset factories
    resetFactories();
    
    // Setup default mock implementations
    mockUseUsersQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      isStale: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    
    mockUseCreateUserMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockUsers[0]),
      isPending: false,
      error: null,
    });
    
    mockUseUpdateUserMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(mockUsers[0]),
      isPending: false,
      error: null,
    });
    
    mockUseDeleteUserMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      error: null,
    });
    
    mockUseUserStatisticsQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    
    mockUseUserQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    
    mockUseUsersWithDogCountsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    
    mockUseUsersSearchQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    
    mockUseUsersByRoleQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have empty initial state', () => {
      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.users).toHaveLength(0);
      expect(result.current.people).toHaveLength(0); // Backward compatibility alias
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Data Operations with Database Integration', () => {
    it('should add a new person with optimistic update', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(mockUsers[0]);
      mockUseCreateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const personInput: UserInput = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '555-0123',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
        },
        associatedDogs: [],
        dogs: [],
      };

      await act(async () => {
        await result.current.addUser(personInput);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining(personInput));
    });

    it('should add person with associated dogs', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        ...mockUsers[0],
        associatedDogs: ['dog-1']
      });
      mockUseCreateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const personInput: UserInput = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '555-0123',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
        },
        associatedDogs: ['dog-1'],
        dogs: [],
      };

      await act(async () => {
        await result.current.addUser(personInput);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        ...personInput,
        associatedDogs: ['dog-1']
      }));
    });

    it('should add person with emergency contact', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        ...mockUsers[0],
        emergencyContact: {
          name: 'Jane Doe',
          phone: '555-0124',
          relationship: 'Spouse'
        }
      });
      mockUseCreateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const personInput: UserInput = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '555-0123',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
        },
        associatedDogs: [],
        dogs: [],
        emergencyContact: {
          name: 'Jane Doe',
          phone: '555-0124',
          relationship: 'Spouse'
        }
      };

      await act(async () => {
        await result.current.addUser(personInput);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        ...personInput,
        emergencyContact: {
          name: 'Jane Doe',
          phone: '555-0124',
          relationship: 'Spouse'
        }
      }));
    });

    it('should handle sync errors gracefully', async () => {
      const mockError = new Error('Sync failed');
      const mockMutateAsync = vi.fn().mockRejectedValue(mockError);
      mockUseCreateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: mockError,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const personInput: UserInput = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '555-0123',
        address: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zipCode: '12345',
        },
        associatedDogs: [],
        dogs: [],
      };

      await expect(async () => {
        await act(async () => {
          await result.current.addUser(personInput);
        });
      }).rejects.toThrow('Sync failed');
    });

    it('should update an existing person', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        ...mockUsers[0],
        firstName: 'Updated John'
      });
      mockUseUpdateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const updateData = { firstName: 'Updated John' };

      await act(async () => {
        await result.current.updateUser('user-1', updateData);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'user-1',
        updates: updateData,
      });
    });

    it('should update associated dogs', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({
        ...mockUsers[0],
        associatedDogs: ['dog-1', 'dog-2']
      });
      mockUseUpdateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const updateData = { associatedDogs: ['dog-1', 'dog-2'] };

      await act(async () => {
        await result.current.updateUser('user-1', updateData);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'user-1',
        updates: updateData,
      });
    });

    it('should delete a person', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUseDeleteUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.deleteUser('user-1');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith('user-1');
    });
  });

  describe('Query Operations', () => {
    it('should retrieve users from database', () => {
      mockUseUsersQuery.mockReturnValue({
        data: mockUsers,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.users).toHaveLength(1);
      expect(result.current.people).toHaveLength(1); // Alias
      expect(result.current.users[0].firstName).toBe('John');
    });

    it('should retrieve a user by ID', () => {
      mockUseUsersQuery.mockReturnValue({
        data: mockUsers,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const user = result.current.getUserById('user-1');
      expect(user).toBeTruthy();
      expect(user?.firstName).toBe('John');
    });

    it('should return null for non-existent user ID', () => {
      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const user = result.current.getUserById('non-existent');
      expect(user).toBeNull();
    });

    it('should retrieve users by role', () => {
      mockUseUsersQuery.mockReturnValue({
        data: mockUsers,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const users = result.current.getUsersByRole('exhibitor');
      expect(users).toHaveLength(1);
      expect(users[0].firstName).toBe('John');
    });

    it('should search users', () => {
      mockUseUsersQuery.mockReturnValue({
        data: mockUsers,
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      const users = result.current.searchUsers('John');
      expect(users).toHaveLength(1);
      expect(users[0].firstName).toBe('John');
    });
  });

  describe('Dialog State Management', () => {
    it('should manage add person dialog state', () => {
      const { result } = renderHook(() => useUserStore());
      
      act(() => {
        result.current.openAddDialog();
      });

      expect(result.current.isAddDialogOpen).toBe(true);
      
      act(() => {
        result.current.closeAddDialog();
      });

      expect(result.current.isAddDialogOpen).toBe(false);
    });

    it('should manage edit person dialog state', () => {
      const { result } = renderHook(() => useUserStore());
      
      act(() => {
        result.current.openEditDialog('user-1');
      });

      expect(result.current.isEditDialogOpen).toBe(true);
      expect(result.current.editingUserId).toBe('user-1');
      
      act(() => {
        result.current.closeEditDialog();
      });

      expect(result.current.isEditDialogOpen).toBe(false);
      expect(result.current.editingUserId).toBeNull();
    });
  });

  describe('Loading and Error States', () => {
    it('should reflect loading state', () => {
      mockUseUsersQuery.mockReturnValue({
        data: [],
        isLoading: true,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.isLoading).toBe(true);
      expect(result.current.getSyncStatus()).toBe('pending');
    });

    it('should reflect error state', () => {
      const mockError = new Error('Database error');
      mockUseUsersQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: mockError,
        isStale: false,
        isFetching: false,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.error).toBe(mockError.message);
      expect(result.current.getSyncStatus()).toBe('error');
    });

    it('should handle mutation loading states', () => {
      mockUseCreateUserMutation.mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: true,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('Legacy Methods', () => {
    it('should support legacy addUserLegacy method', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(mockUsers[0]);
      mockUseCreateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });

      const legacyUser: User = {
        id: 'legacy-1',
        firstName: 'Legacy',
        lastName: 'User',
        email: 'legacy@example.com',
        phone: '555-0000',
        name: 'Legacy User',
        address: '456 Old St',
        city: 'Oldtown',
        state: 'NY',
        zipCode: '54321',
        streetAddress: '456 Old St',
        associatedDogs: [],
        dogs: [],
        roles: ['exhibitor'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await act(async () => {
        result.current.addUserLegacy(legacyUser);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        firstName: 'Legacy',
        lastName: 'User',
        email: 'legacy@example.com'
      }));
    });

    it('should support legacy updateUserLegacy method', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(mockUsers[0]);
      mockUseUpdateUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });

      const legacyUser: User = {
        id: 'user-1',
        firstName: 'Updated',
        lastName: 'User',
        email: 'updated@example.com',
        phone: '555-0001',
        name: 'Updated User',
        address: '789 New St',
        city: 'Newtown',
        state: 'TX',
        zipCode: '98765',
        streetAddress: '789 New St',
        associatedDogs: [],
        dogs: [],
        roles: ['exhibitor'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await act(async () => {
        result.current.updateUserLegacy(legacyUser);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'user-1',
        updates: expect.objectContaining({
          firstName: 'Updated',
          lastName: 'User',
          email: 'updated@example.com'
        })
      });
    });

    it('should support legacy removePerson method with string ID', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUseDeleteUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.removeUser('user-1');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith('user-1');
    });

    it('should support legacy removePerson method with number ID', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUseDeleteUserMutation.mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        result.current.removeUser(123);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith('123');
    });
  });

  describe('Utility Methods', () => {
    it('should replace all people with setUsers', () => {
      const mockRefetch = vi.fn();
      mockUseUsersQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: mockRefetch,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });

      result.current.setUsers();
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('should load users', async () => {
      const mockRefetch = vi.fn().mockResolvedValue(undefined);
      mockUseUsersQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: mockRefetch,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });

      await act(async () => {
        await result.current.loadUsers();
      });

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('React Query Integration', () => {
    it('should provide React Query specific states', () => {
      mockUseUsersQuery.mockReturnValue({
        data: mockUsers,
        isLoading: false,
        error: null,
        isStale: true,
        isFetching: true,
        refetch: vi.fn(),
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      expect(result.current.isStale).toBe(true);
      expect(result.current.isFetching).toBe(true);
    });

    it('should provide refetch functionality', () => {
      const mockRefetch = vi.fn();
      mockUseUsersQuery.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
        isStale: false,
        isFetching: false,
        refetch: mockRefetch,
      });

      const { result } = renderHook(() => useUserStoreCompat(), {
        wrapper: createWrapper(),
      });
      
      result.current.refetch();
      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});