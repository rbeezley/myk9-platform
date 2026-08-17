import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { User } from '@/types/user-types';
import {
  getAllUsers,
  getUserById,
  getDeletedUserById,
  createUser,
  updateUser,
  deleteUser,
  permanentDeleteUser,
  searchUsers,
  getUsersByRole,
  getUsersWithDogCounts,
  getUsersStatistics,
} from '@/services/database/users';
import type { DbUser, DbUserInsert, DbUserUpdate } from '@/types/database-mappings';
import { supabase } from '@/services/database/supabaseClient';
import { logger } from '@/services/LoggingService';
import { ensureError } from '@myk9/core';
import { extractRoles } from '@/services/mappers/userMappers';

export interface AdminUser extends User {
  lastSignInAt: string | null;
}

// Database to UI mapper for User data
export const mapDbUserToUser = (dbUser: DbUser): User => ({
  id: dbUser.id,
  firstName: dbUser.first_name || '',
  lastName: dbUser.last_name || '',
  email: dbUser.email || undefined,
  phone: dbUser.phone || undefined,
  streetAddress: dbUser.street_address || undefined,
  address: dbUser.street_address || undefined,
  city: dbUser.city || undefined,
  state: dbUser.state || undefined,
  zipCode: dbUser.zip_code || undefined,
  country: dbUser.country || undefined,
  profileImage: dbUser.profile_image || undefined,
  user_id: dbUser.auth_user_id || undefined,
  roles: extractRoles(dbUser as unknown as Record<string, unknown>),
  createdAt: dbUser.created_at ? new Date(dbUser.created_at) : undefined,
  updatedAt: dbUser.updated_at ? new Date(dbUser.updated_at) : undefined,
  status: (dbUser.status as 'active' | 'suspended') || 'active',
  deletedAt: dbUser.deleted_at || undefined,
  deletedBy: dbUser.deleted_by || undefined,
});

// UI to Database mapper for User updates
export const mapUserToDbUpdate = (user: Partial<User>): DbUserUpdate => {
  const dbUpdate: DbUserUpdate = {};

  if (user.firstName !== undefined) dbUpdate.first_name = user.firstName;
  if (user.lastName !== undefined) dbUpdate.last_name = user.lastName;
  if (user.email !== undefined) dbUpdate.email = user.email;
  if (user.phone !== undefined) dbUpdate.phone = user.phone;
  // Support both `address` and `streetAddress` fields (User type has both)
  const streetValue = user.address ?? user.streetAddress;
  if (streetValue !== undefined) dbUpdate.street_address = streetValue;
  if (user.city !== undefined) dbUpdate.city = user.city;
  if (user.state !== undefined) dbUpdate.state = user.state;
  if (user.zipCode !== undefined) dbUpdate.zip_code = user.zipCode;
  if (user.country !== undefined) dbUpdate.country = user.country;
  if (user.profileImage !== undefined) dbUpdate.profile_image = user.profileImage;
  // roles are managed via user_roles table, not the people table (people.roles was dropped in migration 066)
  if (user.status !== undefined) dbUpdate.status = user.status;

  return dbUpdate;
};

// User database service implementation
const UserService = {
  getAll: async (): Promise<User[]> => {
    const result = await getAllUsers();
    if (result.error) {
      throw new Error(result.error.message);
    }
    // getAllUsers now selects an explicit column allowlist (SA-008), so its rows
    // are a subset of the full DbUser Row; mapDbUserToUser only reads allowlisted
    // columns. Cast mirrors the existing pattern below.
    return result.data.map(row => mapDbUserToUser(row as unknown as DbUser));
  },

  getById: async (id: string): Promise<User | null> => {
    const result = await getUserById(id);
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data ? mapDbUserToUser(result.data) : null;
  },

  getByRole: async (role: string): Promise<User[]> => {
    const result = await getUsersByRole(role);
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data.map(mapDbUserToUser);
  },

  search: async (searchTerm: string): Promise<User[]> => {
    const result = await searchUsers(searchTerm);
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data.map(mapDbUserToUser);
  },

  create: async (userData: DbUserInsert): Promise<User> => {
    const result = await createUser(userData);
    if (result.error) {
      // Deliberately not carrying the code, unlike `update` below (MYK9-175).
      // The only caller, CreateUserDialog, never reads it: it matches
      // /duplicate key|already exists|23505/ against String(error) and
      // substitutes its own copy, which works on the translated and the raw
      // message alike. Add the code here if a caller ever needs to branch on it.
      throw new Error(result.error.message);
    }
    return mapDbUserToUser(result.data);
  },

  update: async (id: string, updates: Partial<User>): Promise<User> => {
    const dbUpdates = mapUserToDbUpdate(updates);
    const result = await updateUser(id, dbUpdates);
    if (result.error) {
      // Carry the code, not just the message: `getUserFriendlyError` maps by
      // code in production and discards the message, so a bare `new Error`
      // turns an actionable refusal into "Failed to update user" (MYK9-136).
      throw Object.assign(new Error(result.error.message), { code: result.error.code });
    }
    return mapDbUserToUser(result.data);
  },

  delete: async (id: string, deletedBy?: string): Promise<void> => {
    const result = await deleteUser(id, deletedBy);
    if (result.error) {
      // Create a more detailed error object for handling in the UI
      interface ErrorWithDetails extends Error {
        code?: string;
        details?: {
          entryCount: number;
          dogCount: number;
          canCascade: boolean;
        };
      }
      const error = new Error(result.error.message) as ErrorWithDetails;
      if (result.error.code !== undefined) {
        error.code = result.error.code;
      }
      if (typeof result.error.details === 'object' && result.error.details !== null) {
        error.details = result.error.details;
      }
      throw error;
    }
  },

  permanentDelete: async (id: string): Promise<void> => {
    const result = await permanentDeleteUser(id);
    if (result.error) {
      interface ErrorWithDatabaseMetadata extends Error {
        code?: string;
        details?: string;
      }
      const error = new Error(result.error.message) as ErrorWithDatabaseMetadata;
      if (result.error.code !== undefined) {
        error.code = result.error.code;
      }
      if (result.error.details !== undefined) {
        error.details = result.error.details;
      }
      throw error;
    }
  },

  getWithDogCounts: async () => {
    const result = await getUsersWithDogCounts();
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data;
  },

  getStatistics: async () => {
    const result = await getUsersStatistics();
    if (result.error) {
      throw new Error(result.error.message);
    }
    return result.data;
  },
};

// Query hooks
export function useUsersQuery() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: UserService.getAll,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAdminUsersQuery(showDeleted: boolean) {
  return useQuery({
    queryKey: [...queryKeys.users.all, 'admin', { showDeleted }],
    queryFn: async (): Promise<AdminUser[]> => {
      try {
        const { data, error } = await supabase.rpc('get_admin_user_list', {
          show_deleted: showDeleted,
        });

        if (error) {
          throw new Error(error.message);
        }

        return (data ?? []).map((row: Record<string, unknown>): AdminUser => ({
          ...mapDbUserToUser(row as unknown as DbUser),
          lastSignInAt: (row.last_sign_in_at as string) || null,
        }));
      } catch (err) {
        const error = ensureError(err);
        logger.error('Failed to fetch admin user list', 'query', {}, error);
        throw error;
      }
    },
  });
}

export function useUserQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => UserService.getById(id),
    enabled: !!id,
  });
}

/**
 * The record of a person who has been REMOVED.
 *
 * Separate from `useUserQuery` because it is a different read path with a
 * different audience: `getUserById` filters `deleted_at IS NULL`, and the RLS
 * behind it hides removed people from every role, so the only way to see one is
 * the admin-gated RPC. Pass `enabled` false for viewers who have no business
 * seeing removed people — the RPC refuses them anyway, but asking is noise.
 *
 * Resolves to null for a live person or an unknown id, so a caller can treat
 * "not removed" and "not there" the same way.
 */
export function useDeletedUserQuery(id: string, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.users.detail(id), 'deleted'],
    queryFn: async (): Promise<User | null> => {
      const { data, error } = await getDeletedUserById(id);
      if (error) throw error;
      return data ? mapDbUserToUser(data as unknown as DbUser) : null;
    },
    enabled: !!id && enabled,
  });
}

export function useUsersByRoleQuery(role: string) {
  return useQuery({
    queryKey: queryKeys.users.byRole(role),
    queryFn: () => UserService.getByRole(role),
    enabled: !!role,
  });
}

export function useUsersSearchQuery(searchTerm: string) {
  return useQuery({
    queryKey: queryKeys.users.search(searchTerm),
    queryFn: () => UserService.search(searchTerm),
    enabled: !!searchTerm && searchTerm.length >= 2,
  });
}

export function useUsersWithDogCountsQuery() {
  return useQuery({
    queryKey: queryKeys.users.withDogCounts(),
    queryFn: UserService.getWithDogCounts,
  });
}

export function useUsersStatisticsQuery() {
  return useQuery({
    queryKey: queryKeys.users.statistics(),
    queryFn: UserService.getStatistics,
  });
}

// Mutation hooks
export function useCreateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: UserService.create,
    onSuccess: newUser => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });

      queryClient.setQueryData(queryKeys.users.all, (oldData: User[] | undefined) => {
        if (!oldData) return [newUser];
        return [...oldData, newUser];
      });

      // useAdminUsersQuery reads [...users.all, 'admin', { showDeleted }], which
      // the exact-key invalidate above does not reach — so a newly created user
      // stayed missing from /admin/users until something else refetched.
      // useUpdateUserMutation already does this.
      queryClient.invalidateQueries({ queryKey: [...queryKeys.users.all, 'admin'] });
    },
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<User> }) =>
      UserService.update(id, updates),
    onSuccess: (updatedUser: User) => {
      queryClient.setQueryData(queryKeys.users.detail(updatedUser.id), updatedUser);

      queryClient.setQueryData(queryKeys.users.all, (oldData: User[] | undefined) => {
        if (!oldData) return [updatedUser];
        return oldData.map(user => (user.id === updatedUser.id ? updatedUser : user));
      });

      queryClient.invalidateQueries({ queryKey: [...queryKeys.users.all, 'admin'] });
    },
  });
}

export function useDeleteUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deletedBy }: { id: string; deletedBy?: string }) =>
      UserService.delete(id, deletedBy),
    onSuccess: (_, variables) => {
      const deletedId = variables.id;
      queryClient.removeQueries({ queryKey: queryKeys.users.detail(deletedId) });

      queryClient.setQueryData(queryKeys.users.all, (oldData: User[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(user => user.id !== deletedId);
      });
    },
  });
}

export function usePermanentDeleteUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => UserService.permanentDelete(id),
    onSuccess: (_, variables) => {
      const deletedId = variables.id;
      queryClient.removeQueries({ queryKey: queryKeys.users.detail(deletedId) });

      queryClient.setQueryData(queryKeys.users.all, (oldData: User[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(user => user.id !== deletedId);
      });
    },
  });
}

// Optimistic update hooks
export function useOptimisticUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<User> }) =>
      UserService.update(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.users.detail(id) });
      await queryClient.cancelQueries({ queryKey: queryKeys.users.all });

      const previousUser = queryClient.getQueryData(queryKeys.users.detail(id));
      const previousUsers = queryClient.getQueryData(queryKeys.users.all);

      if (previousUser) {
        const optimisticUser = { ...(previousUser as User), ...updates };
        queryClient.setQueryData(queryKeys.users.detail(id), optimisticUser);

        queryClient.setQueryData(queryKeys.users.all, (oldData: User[] | undefined) => {
          if (!oldData) return [optimisticUser];
          return oldData.map(user => (user.id === id ? optimisticUser : user));
        });
      }

      return { previousUser, previousUsers };
    },
    onError: (_err, variables, context) => {
      if (context?.previousUser) {
        queryClient.setQueryData(queryKeys.users.detail(variables.id), context.previousUser);
      }
      if (context?.previousUsers) {
        queryClient.setQueryData(queryKeys.users.all, context.previousUsers);
      }
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
