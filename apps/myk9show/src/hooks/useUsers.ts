import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { notifications } from '@/lib/notifications';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} from '@/services/database/users';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';
import { savePersonRoles } from '@/components/panels/edit/personRolesService';

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
      });
      if (error || !data) throw new Error(error?.message || 'Failed to create user');

      const newPersonId = (data as Record<string, unknown>).id as string;
      const roles = person.roles?.length ? person.roles : [UserRole.EXHIBITOR];
      await savePersonRoles(newPersonId, roles);

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
      // Support both `address` and `streetAddress` fields (User type has both)
      const streetValue = person.address || person.streetAddress || null;
      const { data, error } = await updateUser(person.id, {
        first_name: person.firstName,
        last_name: person.lastName,
        email: person.email || null,
        phone: person.phone || null,
        street_address: streetValue,
        city: person.city || null,
        state: person.state || null,
        zip_code: person.zipCode || null,
        profile_image: person.profileImage || null,
      });
      if (error || !data) throw new Error(error?.message || 'Failed to update user');
      return mapDatabaseToUser(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
    onError: (error: Error) => {
      notifications.error(error.message || 'Failed to save profile.');
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
