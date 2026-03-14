// Compatibility layer between userStore and React Query
// Phase 2.2: User Store Integration

import { useMemo } from 'react';
import type { User } from '@/types/user-types';
import type { UserInput } from '@/store/userStore';
import {
  useUsersQuery,
  useUserQuery,
  useUsersWithDogCountsQuery,
  useUsersSearchQuery,
  useUsersByRoleQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUserStatisticsQuery,
} from '@/hooks/queries/useUsersDatabase';
import {
  mapUserInputToInsert,
  mapUserInputToUpdate,
  mapDatabaseToUser,
  mapDatabaseUsersArray,
} from '@/services/mappers/userMappers';

/**
 * Compatibility hook that provides userStore-like API using React Query
 * This allows existing components to work unchanged while using the database
 */
export const useUserStoreCompat = () => {
  const usersQuery = useUsersQuery();
  const createMutation = useCreateUserMutation();
  const updateMutation = useUpdateUserMutation();
  const deleteMutation = useDeleteUserMutation();
  const statisticsQuery = useUserStatisticsQuery();

  // Convert database results to User format for backward compatibility
  const users = useMemo(() => {
    if (!usersQuery.data) return [];
    return mapDatabaseUsersArray(usersQuery.data);
  }, [usersQuery.data]);

  // Backward compatibility alias
  const people = users;

  // Aggregate loading states
  const isLoading = usersQuery.isLoading || 
    createMutation.isPending || 
    updateMutation.isPending || 
    deleteMutation.isPending;

  // Aggregate error states (prioritize by recency)
  const error = useMemo(() => {
    const errors = [
      usersQuery.error,
      createMutation.error,
      updateMutation.error,
      deleteMutation.error,
    ].filter(Boolean);
    
    if (errors.length === 0) return null;
    return errors[0]?.message || 'An error occurred';
  }, [usersQuery.error, createMutation.error, updateMutation.error, deleteMutation.error]);

  // userStore-compatible API
  const addUser = async (userData: UserInput): Promise<User> => {
    const dbData = mapUserInputToInsert(userData);
    const result = await createMutation.mutateAsync(dbData);
    return mapDatabaseToUser(result);
  };

  const updateUser = async (id: string, updates: Partial<UserInput>): Promise<User | null> => {
    const dbUpdates = mapUserInputToUpdate(updates);
    const result = await updateMutation.mutateAsync({ id, updates: dbUpdates });
    return result ? mapDatabaseToUser(result) : null;
  };

  const deleteUser = async (id: string): Promise<void> => {
    await deleteMutation.mutateAsync({ id });
  };

  const getUserById = (id: string): User | null => {
    return users.find(user => user.id === id) || null;
  };

  const getUsersByRole = (role: string): User[] => {
    return users.filter(user => user.roles?.includes(role as (typeof user.roles)[number]));
  };

  const searchUsers = (searchTerm: string): User[] => {
    if (!searchTerm) return users;
    const term = searchTerm.toLowerCase();
    return users.filter(user => 
      user.firstName?.toLowerCase().includes(term) ||
      user.lastName?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term) ||
      user.name?.toLowerCase().includes(term)
    );
  };

  const getSyncStatus = (): 'synced' | 'pending' | 'error' | 'conflict' => {
    if (isLoading) return 'pending';
    if (error) return 'error';
    return 'synced';
  };

  const refetch = () => {
    usersQuery.refetch();
  };

  // Legacy methods for backward compatibility
  const addUserLegacy = (user: User) => {
    const street = user.streetAddress || user.address;
    const userInput: UserInput = {
      firstName: user.firstName,
      lastName: user.lastName,
      ...(user.email !== undefined && { email: user.email }),
      ...(user.phone !== undefined && { phone: user.phone }),
      address: {
        ...(street !== undefined && { street }),
        ...(user.city !== undefined && { city: user.city }),
        ...(user.state !== undefined && { state: user.state }),
        ...(user.zipCode !== undefined && { zipCode: user.zipCode }),
      },
      ...(user.dogs !== undefined && { dogs: user.dogs }),
    };
    addUser(userInput);
  };

  const updateUserLegacy = (user: User) => {
    const street = user.streetAddress || user.address;
    const userInput: UserInput = {
      firstName: user.firstName,
      lastName: user.lastName,
      ...(user.email !== undefined && { email: user.email }),
      ...(user.phone !== undefined && { phone: user.phone }),
      address: {
        ...(street !== undefined && { street }),
        ...(user.city !== undefined && { city: user.city }),
        ...(user.state !== undefined && { state: user.state }),
        ...(user.zipCode !== undefined && { zipCode: user.zipCode }),
      },
      ...(user.dogs !== undefined && { dogs: user.dogs }),
    };
    updateUser(user.id, userInput);
  };

  const removeUser = (id: string | number): void => {
    deleteUser(String(id));
  };

  // Additional utility methods
  const setUsers = (): void => {
    // In React Query mode, this doesn't directly set users
    // but we can trigger a refetch to sync with server
    refetch();
  };

  const loadUsers = async (): Promise<void> => {
    await refetch();
  };

  return {
    // Data
    users,
    people, // Backward compatibility alias
    isLoading,
    error,
    
    // Operations (compatible with userStore API)
    addUser,
    updateUser,
    deleteUser,
    getUserById,
    getUsersByRole,
    searchUsers,
    getSyncStatus,
    
    // Legacy methods for backward compatibility
    addUserLegacy,
    updateUserLegacy,
    removeUser,
    setUsers,
    loadUsers,
    
    // Additional React Query benefits
    refetch,
    isStale: usersQuery.isStale,
    isFetching: usersQuery.isFetching,
    
    // Statistics
    statistics: statisticsQuery.data,
    isLoadingStatistics: statisticsQuery.isLoading,
    
    // Individual mutation states for fine-grained control
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    
    // Legacy compatibility flags
    _usingDatabase: true,
    _reactQueryIntegrated: true,
  };
};

/**
 * Hook for getting a single user with React Query benefits
 */
export const useUserWithQuery = (id: string, enabled = true) => {
  const userQuery = useUserQuery(id, enabled);
  
  const user = useMemo(() => {
    if (!userQuery.data) return null;
    return mapDatabaseToUser(userQuery.data);
  }, [userQuery.data]);

  return {
    user,
    isLoading: userQuery.isLoading,
    error: userQuery.error?.message || null,
    refetch: userQuery.refetch,
    isStale: userQuery.isStale,
  };
};

/**
 * Hook for searching users with React Query benefits
 */
export const useUserSearchWithQuery = (searchTerm: string, enabled = true) => {
  const searchQuery = useUsersSearchQuery(searchTerm, enabled);
  
  const users = useMemo(() => {
    if (!searchQuery.data) return [];
    return mapDatabaseUsersArray(searchQuery.data);
  }, [searchQuery.data]);

  return {
    users,
    people: users, // Backward compatibility alias
    isLoading: searchQuery.isLoading,
    error: searchQuery.error?.message || null,
    refetch: searchQuery.refetch,
    isStale: searchQuery.isStale,
  };
};

/**
 * Hook for getting users with dog counts
 */
export const useUsersWithDogCountsCompat = () => {
  const dogCountsQuery = useUsersWithDogCountsQuery();
  
  const users = useMemo(() => {
    if (!dogCountsQuery.data) return [];
    return mapDatabaseUsersArray(dogCountsQuery.data);
  }, [dogCountsQuery.data]);

  return {
    users,
    people: users, // Backward compatibility alias
    isLoading: dogCountsQuery.isLoading,
    error: dogCountsQuery.error?.message || null,
    refetch: dogCountsQuery.refetch,
    isStale: dogCountsQuery.isStale,
  };
};

/**
 * Hook for getting users by role with React Query benefits
 */
export const useUsersByRoleWithQuery = (role: string, enabled = true) => {
  const roleQuery = useUsersByRoleQuery(role, enabled);
  
  const users = useMemo(() => {
    if (!roleQuery.data) return [];
    return mapDatabaseUsersArray(roleQuery.data);
  }, [roleQuery.data]);

  return {
    users,
    people: users, // Backward compatibility alias
    isLoading: roleQuery.isLoading,
    error: roleQuery.error?.message || null,
    refetch: roleQuery.refetch,
    isStale: roleQuery.isStale,
  };
};