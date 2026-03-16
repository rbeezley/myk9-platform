import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useUserStore } from '@/store/userStore';
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

/**
 * Hook to filter data based on user's role
 * - Exhibitors: Only see their own dogs and their own profile
 * - Secretary/Club Admin/Site Admin: See all dogs and people
 */
export function useRoleBasedDogs() {
  const { userWithRoles, hasRole } = useAuthContext();
  const { dogs: allDogs, isLoading, error } = useDogStoreCompat();
  const allPeople = useUserStore(state => state.people);

  const filteredDogs = useMemo(() => {
    if (!userWithRoles || isLoading || error) {
      return [];
    }

    // Site admins, club admins, and secretaries see all dogs
    if (
      hasRole(UserRole.SITE_ADMIN) ||
      hasRole(UserRole.CLUB_ADMIN) ||
      hasRole(UserRole.SECRETARY)
    ) {
      return allDogs;
    }

    // Exhibitors only see their own dogs
    const userPerson = getUserPersonFromAuthId(userWithRoles.id, allPeople);

    if (!userPerson) {
      return [];
    }

    return allDogs.filter(dog => dog.ownerId === userPerson.id);
  }, [userWithRoles, allDogs, allPeople, hasRole, isLoading, error]);

  return filteredDogs;
}

export function useRoleBasedPeople() {
  const { userWithRoles, hasRole } = useAuthContext();
  const { data: allPeople = [], isLoading, error } = useUsersQuery();

  const filteredPeople = useMemo(() => {
    // Early return for loading, error, or empty data
    if (isLoading || error || !userWithRoles || !allPeople || allPeople.length === 0) {
      return [];
    }

    // Site admins, club admins, and secretaries see all people
    if (
      hasRole(UserRole.SITE_ADMIN) ||
      hasRole(UserRole.CLUB_ADMIN) ||
      hasRole(UserRole.SECRETARY)
    ) {
      return allPeople;
    }

    // Exhibitors only see themselves - find by user_id matching current auth user
    if (userWithRoles.id) {
      return allPeople.filter(person => person.user_id === userWithRoles.id);
    }

    return [];
  }, [userWithRoles, hasRole, allPeople, isLoading, error]);

  return { people: filteredPeople, isLoading, error: error as Error | null };
}

/**
 * Find the person record for an auth user by matching user_id.
 */
function getUserPersonFromAuthId(authUserId?: string, allPeople: User[] = []): User | null {
  if (!authUserId) return null;
  return allPeople.find(p => p.user_id === authUserId) || null;
}

/**
 * Hook to check if the current user owns a specific dog
 */
export function useCanAccessDog(dogId: string): boolean {
  const { userWithRoles, hasRole } = useAuthContext();
  const { dogs } = useDogStoreCompat();
  const allPeople = useUserStore(state => state.people);

  return useMemo(() => {
    if (!userWithRoles) return false;

    // Admins and secretaries can access all dogs
    if (
      hasRole(UserRole.SITE_ADMIN) ||
      hasRole(UserRole.CLUB_ADMIN) ||
      hasRole(UserRole.SECRETARY)
    ) {
      return true;
    }

    // Check if user owns this dog
    const dog = dogs.find(d => d.id === dogId);
    if (!dog) return false;

    const userPerson = getUserPersonFromAuthId(userWithRoles.id, allPeople);
    return dog.ownerId === userPerson?.id;
  }, [userWithRoles, hasRole, dogs, dogId, allPeople]);
}

/**
 * Hook to check if the current user can access a specific person
 */
export function useCanAccessPerson(personId: string): boolean {
  const { userWithRoles, hasRole } = useAuthContext();
  const allPeople = useUserStore(state => state.people);

  return useMemo(() => {
    if (!userWithRoles) return false;

    // Admins and secretaries can access all people
    if (
      hasRole(UserRole.SITE_ADMIN) ||
      hasRole(UserRole.CLUB_ADMIN) ||
      hasRole(UserRole.SECRETARY)
    ) {
      return true;
    }

    // Exhibitors can only access themselves
    const userPerson = getUserPersonFromAuthId(userWithRoles.id, allPeople);
    return personId === userPerson?.id;
  }, [userWithRoles, hasRole, personId, allPeople]);
}

/**
 * Hook to get the current user's person ID
 */
export function useCurrentUserPersonId(): string | null {
  const { userWithRoles } = useAuthContext();
  const allPeople = useUserStore(state => state.people);

  return useMemo(() => {
    if (!userWithRoles) return null;

    const userPerson = getUserPersonFromAuthId(userWithRoles.id, allPeople);
    return userPerson?.id || null;
  }, [userWithRoles, allPeople]);
}
