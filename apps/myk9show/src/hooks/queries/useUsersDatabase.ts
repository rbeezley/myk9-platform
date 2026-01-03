// React Query hooks for database user operations
// User Store Integration - Following Dog Store Pattern
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  hardDeleteUser,
  restoreUser,
  getDeletedUsers,
  searchUsers,
  getUsersByRole,
  getUsersWithDogCounts,
  getUsersStatistics,
  checkEmailExists
} from '@/services/database/queries/userQueries';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';
import { invalidateQueries } from '@/services/database/queryClient';
import type { DbUserInsert, DbUserUpdate } from '@/types/database-mappings';

// Get all users
export const useUsersQuery = () => {
  return useQuery({
    queryKey: queryKeys.people, // Reusing existing people key for compatibility
    queryFn: async () => {
      const { data, error } = await getAllUsers();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.moderate, // 5 minutes stale, 10 minutes cache
  });
};

// Get user by ID with full details
export const useUserQuery = (id: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.person(id), // Reusing existing person key for compatibility
    queryFn: async () => {
      const { data, error } = await getUserById(id);
      if (error) throw error;
      return data;
    },
    enabled: !!id && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get users with dog counts
export const useUsersWithDogCountsQuery = () => {
  return useQuery({
    queryKey: ['users', 'with-dog-counts'],
    queryFn: async () => {
      const { data, error } = await getUsersWithDogCounts();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.moderate,
  });
};

// Search users by name or email
export const useUsersSearchQuery = (searchTerm: string, enabled = true) => {
  return useQuery({
    queryKey: queryKeys.peopleSearch(searchTerm), // Reusing existing search key
    queryFn: async () => {
      const { data, error } = await searchUsers(searchTerm);
      if (error) throw error;
      return data;
    },
    enabled: !!searchTerm && searchTerm.length >= 2 && enabled,
    ...cacheStrategies.dynamic, // 1 minute stale for search results
  });
};

// Get users by role
export const useUsersByRoleQuery = (role: string, enabled = true) => {
  return useQuery({
    queryKey: ['users', 'by-role', role],
    queryFn: async () => {
      const { data, error } = await getUsersByRole(role);
      if (error) throw error;
      return data;
    },
    enabled: !!role && enabled,
    ...cacheStrategies.moderate,
  });
};

// Get user statistics
export const useUserStatisticsQuery = () => {
  return useQuery({
    queryKey: ['users', 'statistics'],
    queryFn: async () => {
      const { data, error } = await getUsersStatistics();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.static, // 30 minutes stale for statistics
  });
};

// Check if email exists
export const useEmailExistsQuery = (email: string, excludeId?: string, enabled = true) => {
  return useQuery({
    queryKey: ['users', 'email-exists', email, excludeId],
    queryFn: async () => {
      const { exists, data, error } = await checkEmailExists(email, excludeId);
      if (error) throw error;
      return { exists, data };
    },
    enabled: !!email && email.length > 0 && enabled,
    ...cacheStrategies.dynamic, // 1 minute stale for email checks
  });
};

// Create user mutation
export const useCreateUserMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userData: DbUserInsert) => {
      const { data, error } = await createUser(userData);
      if (error) throw error;
      return data;
    },
    onMutate: async (newUser) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.people });

      // Snapshot the previous value
      const previousUsers = queryClient.getQueryData(queryKeys.people);

      // Optimistically update to the new value
      if (previousUsers) {
        queryClient.setQueryData(queryKeys.people, (old: unknown) => {
          const users = old as Array<{ id: string; first_name: string; last_name: string }>;
          return [...users, { ...newUser, id: 'temp-' + Date.now() }];
        });
      }

      // Return a context object with the snapshotted value
      return { previousUsers };
    },
    onError: (err, newUser, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousUsers) {
        queryClient.setQueryData(queryKeys.people, context.previousUsers);
      }
    },
    onSuccess: (data) => {
      // Invalidate and refetch
      invalidateQueries.all('people');
      
      // Update the cache with the new user data
      if (data) {
        queryClient.setQueryData(queryKeys.person(data.id), data);
      }
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['users', 'statistics'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'with-dog-counts'] });
    },
  });
};

// Update user mutation
export const useUpdateUserMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: DbUserUpdate }) => {
      const { data, error } = await updateUser(id, updates);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id, updates }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.person(id) });

      // Snapshot the previous value
      const previousUser = queryClient.getQueryData(queryKeys.person(id));

      // Optimistically update to the new value
      if (previousUser) {
        queryClient.setQueryData(queryKeys.person(id), (old: unknown) => {
          return { ...(old as Record<string, unknown>), ...updates };
        });
      }

      return { previousUser };
    },
    onError: (err, { id }, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousUser) {
        queryClient.setQueryData(queryKeys.person(id), context.previousUser);
      }
    },
    onSuccess: (data, { id }) => {
      // Update specific user cache
      queryClient.setQueryData(queryKeys.person(id), data);
      
      // Invalidate users list to ensure consistency
      invalidateQueries.lists('people');
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['users', 'with-dog-counts'] });
    },
  });
};

// Delete user mutation (soft delete)
export const useDeleteUserMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, deletedBy }: { id: string; deletedBy?: string }) => {
      const { data, error } = await deleteUser(id, deletedBy);
      if (error) throw error;
      return data;
    },
    onMutate: async ({ id: deletedId }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.people });

      // Snapshot the previous value
      const previousUsers = queryClient.getQueryData(queryKeys.people);

      // Optimistically update by removing the user
      if (previousUsers) {
        queryClient.setQueryData(queryKeys.people, (old: unknown) => {
          const users = old as Array<{ id: string }>;
          return users.filter(user => user.id !== deletedId);
        });
      }

      return { previousUsers };
    },
    onError: (_err, _variables, context) => {
      // If the mutation fails, use the context to roll back
      if (context?.previousUsers) {
        queryClient.setQueryData(queryKeys.people, context.previousUsers);
      }
    },
    onSuccess: (deletedData, { id: deletedId }) => {
      // Remove from cache completely
      queryClient.removeQueries({ queryKey: queryKeys.person(deletedId) });
      
      // Invalidate users list
      invalidateQueries.all('people');
      
      // Invalidate statistics since count changed
      queryClient.invalidateQueries({ queryKey: ['users', 'statistics'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'with-dog-counts'] });
    },
  });
};

// Get deleted users query
export const useDeletedUsersQuery = () => {
  return useQuery({
    queryKey: ['users', 'deleted'],
    queryFn: async () => {
      const { data, error } = await getDeletedUsers();
      if (error) throw error;
      return data;
    },
    ...cacheStrategies.dynamic, // 1 minute stale for admin data
  });
};

// Restore user mutation
export const useRestoreUserMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, restoredBy }: { id: string; restoredBy?: string }) => {
      const { data, error } = await restoreUser(id, restoredBy);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
      queryClient.invalidateQueries({ queryKey: ['users', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'statistics'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'with-dog-counts'] });
    },
  });
};

// Hard delete user mutation (permanent removal)
export const useHardDeleteUserMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await hardDeleteUser(id);
      if (error) throw error;
      return data;
    },
    onSuccess: (data, id) => {
      // Remove from all caches
      queryClient.removeQueries({ queryKey: queryKeys.person(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.people });
      queryClient.invalidateQueries({ queryKey: ['users', 'deleted'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'statistics'] });
      queryClient.invalidateQueries({ queryKey: ['users', 'with-dog-counts'] });
    },
  });
};

// Prefetch user details for performance
export const usePrefetchUser = () => {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.person(id),
      queryFn: async () => {
        const { data, error } = await getUserById(id);
        if (error) throw error;
        return data;
      },
      staleTime: cacheStrategies.moderate.staleTime,
    });
  };
};

// Custom hook for user management with all operations
export const useUserManagement = () => {
  const usersQuery = useUsersQuery();
  const createMutation = useCreateUserMutation();
  const updateMutation = useUpdateUserMutation();
  const deleteMutation = useDeleteUserMutation();
  const prefetchUser = usePrefetchUser();

  return {
    // Queries
    users: usersQuery.data,
    isLoading: usersQuery.isLoading,
    error: usersQuery.error,
    
    // Mutations
    createUser: createMutation.mutate,
    isCreating: createMutation.isPending,
    
    updateUser: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    
    deleteUser: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    
    // Utilities
    prefetchUser,
    refetch: usersQuery.refetch,
  };
};