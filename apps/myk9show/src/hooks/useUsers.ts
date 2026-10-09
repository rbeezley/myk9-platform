import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { getAllUsers, createUser, deleteUser } from '@/services/database/users';
import { mapDatabaseToUser } from '@/services/mappers/userMappers';
import { rbacService } from '@/services/rbac';
import { useSavePersonDetails } from '@/hooks/useSavePersonDetails';

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
      try {
        await Promise.all(
          roles.map(roleName => rbacService.assignRole({ userId: newPersonId, roleName }))
        );
      } catch (roleError) {
        // Do not leave a person that the caller was told failed to create.
        const { error: rollbackError } = await deleteUser(newPersonId);
        if (rollbackError) {
          throw new Error(
            `Role assignment failed and user rollback failed: ${rollbackError.message}`
          );
        }
        throw roleError;
      }

      return mapDatabaseToUser(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();
  const savePerson = useSavePersonDetails();
  return useMutation({
    // Queued saves work offline (MYK9-1071), so the mutation must not pause there.
    networkMode: 'always',
    mutationFn: async (person: User): Promise<User> => {
      // Support both `address` and `streetAddress` fields (User type has both)
      const streetValue = person.address || person.streetAddress || null;
      // Queued through update_person_details_versioned, or online for an email
      // change (savePersonDetails). Refusals keep their code (MYK9-136).
      const result = await savePerson(person.id, {
        first_name: person.firstName,
        last_name: person.lastName,
        email: person.email || null,
        phone: person.phone || null,
        street_address: streetValue,
        city: person.city || null,
        state: person.state || null,
        zip_code: person.zipCode || null,
        profile_image: person.profileImage || null,
        // MYK9-570 / MYK9-664: written to `people_private` with the same save.
        // Forwarded only when the caller set them: an absent value means "leave
        // what is stored", and a manager's form never holds the stored value.
        ...(person.dateOfBirth !== undefined && { date_of_birth: person.dateOfBirth || null }),
        ...(person.juniorHandlerNumbers !== undefined && {
          junior_handler_numbers: person.juniorHandlerNumbers,
        }),
      });
      return mapDatabaseToUser(result.person);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      // MYK9-1010: the dog roster carries each owner's address, which gates
      // AKC classes in the entry wizard.
      queryClient.invalidateQueries({ queryKey: queryKeys.dogs });
    },
  });
}
