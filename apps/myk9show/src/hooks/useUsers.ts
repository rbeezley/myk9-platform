import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import type { User } from '../types/dog-types';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} from '@/services/database/queries/userQueries';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';

export function useUsers() {
  return useQuery<User[]>({
    queryKey: queryKeys.users.all,
    queryFn: async () => {
      const { data, error } = await getAllUsers();
      if (error) throw new Error(error.message);
      return data.map(mapDatabaseToUser);
    },
  });
}

export function useAddPerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (person: User): Promise<User> => {
      const { data, error } = await createUser({
        first_name: person.firstName,
        last_name: person.lastName,
        email: person.email || null,
        phone: person.phone || null,
        street_address: person.streetAddress || null,
        city: person.city || null,
        state: person.state || null,
        zip_code: person.zipCode || null,
        roles: person.roles || [],
      });
      if (error || !data) throw new Error(error?.message || 'Failed to create user');
      return mapDatabaseToUser(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (person: User): Promise<User> => {
      const { data, error } = await updateUser(person.id, {
        first_name: person.firstName,
        last_name: person.lastName,
        email: person.email || null,
        phone: person.phone || null,
        street_address: person.streetAddress || null,
        city: person.city || null,
        state: person.state || null,
        zip_code: person.zipCode || null,
        roles: person.roles || [],
      });
      if (error || !data) throw new Error(error?.message || 'Failed to update user');
      return mapDatabaseToUser(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useDeletePerson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (personId: string): Promise<void> => {
      const { error } = await deleteUser(personId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
