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
    console.log('🐕 useRoleBasedDogs debug:', {
      isLoading,
      error: error?.toString(),
      userWithRoles: userWithRoles?.email,
      userRoles: userWithRoles?.roles,
      allDogsCount: allDogs?.length,
      allDogs: allDogs?.slice(0, 3), // First 3 for debugging
      hasSiteAdmin: hasRole(UserRole.SITE_ADMIN),
      hasClubAdmin: hasRole(UserRole.CLUB_ADMIN),
      hasSecretary: hasRole(UserRole.SECRETARY)
    });

    if (!userWithRoles || isLoading || error) {
      console.log('🚫 Early return due to:', { userWithRoles: !!userWithRoles, isLoading, error: !!error });
      return [];
    }
    
    // Site admins, club admins, and secretaries see all dogs
    if (hasRole(UserRole.SITE_ADMIN) || 
        hasRole(UserRole.CLUB_ADMIN) || 
        hasRole(UserRole.SECRETARY)) {
      console.log('✅ Admin/Secretary access - showing all dogs:', allDogs.length);
      return allDogs;
    }
    
    // Exhibitors only see their own dogs
    const userPerson = getUserPersonFromEmailStable(userWithRoles.email, allPeople);
    
    if (!userPerson) {
      console.log('🚫 No user person found for email:', userWithRoles.email);
      return [];
    }
    
    const filtered = allDogs.filter(dog => dog.ownerId === userPerson.id);
    console.log('👤 Exhibitor access - filtered to own dogs:', filtered.length);
    return filtered;
  }, [userWithRoles, allDogs, allPeople, hasRole, isLoading, error]);
  
  return filteredDogs;
}

export function useRoleBasedPeople() {
  const { userWithRoles, hasRole } = useAuthContext();
  const { data: allPeople = [], isLoading, error } = useUsersQuery();
  
  const filteredPeople = useMemo(() => {
    // Debug logging
    console.log('🔍 useRoleBasedPeople debug (Supabase):', {
      isLoading,
      error: error?.message,
      userWithRoles: userWithRoles?.email,
      userRoles: userWithRoles?.roles,
      allPeopleCount: allPeople?.length,
      allPeople: allPeople?.slice(0, 3), // First 3 users for debugging
      hasSiteAdmin: hasRole(UserRole.SITE_ADMIN),
      hasClubAdmin: hasRole(UserRole.CLUB_ADMIN),
      hasSecretary: hasRole(UserRole.SECRETARY)
    });
    
    // Early return for loading, error, or empty data
    if (isLoading || error || !userWithRoles || !allPeople || allPeople.length === 0) {
      console.log('🚫 Early return due to:', { isLoading, error: !!error, userWithRoles: !!userWithRoles, allPeopleLength: allPeople?.length });
      return [];
    }
    
    // Site admins, club admins, and secretaries see all people
    if (hasRole(UserRole.SITE_ADMIN) || 
        hasRole(UserRole.CLUB_ADMIN) || 
        hasRole(UserRole.SECRETARY)) {
      console.log('✅ Admin/Secretary access - showing all people:', allPeople.length);
      return allPeople;
    }
    
    // Exhibitors only see themselves - find by user_id matching current auth user
    if (userWithRoles.id) {
      const filtered = allPeople.filter(person => person.user_id === userWithRoles.id);
      console.log('👤 Exhibitor access - filtered to own record:', filtered.length);
      return filtered;
    }
    
    console.log('🚫 No user ID found for filtering');
    return [];
  }, [userWithRoles, hasRole, allPeople, isLoading, error]);
  
  return filteredPeople;
}

/**
 * Helper function to map user email to person record
 * In production, this would be handled by the backend
 * This version takes people as a parameter to avoid triggering store subscriptions
 */
function getUserPersonFromEmailStable(email?: string, allPeople: User[] = []): User | null {
  if (!email) return null;
  
  // Mock mapping for development
  // In production, this would come from the user's profile
  const emailToPersonMap: Record<string, string> = {
    'exhibitor@example.com': '1', // Jane Doe
    'jane.doe@example.com': '1',
    'richard@myk9t.com': '1', // Map Richard to Jane Doe (who owns Bella and Lucy) - note: myk9t not myk9l
    'john.smith@example.com': '2',
    'michael.johnson@example.com': '3',
    'sarah.garcia@example.com': '4',
    'david.williams@example.com': '5',
    'dev@example.com': '6', // Development user
    // Secretary and admin users don't have person records in our mock data
  };
  
  const personId = emailToPersonMap[email];
  if (!personId) return null;
  
  return allPeople.find(p => p.id === personId) || null;
}

/**
 * Helper function to map user email to person record (legacy version)
 * @deprecated Use getUserPersonFromEmailStable instead to avoid re-render issues
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getUserPersonFromEmail(email?: string): User | null {
  if (!email) return null;
  
  // Mock mapping for development
  // In production, this would come from the user's profile
  const emailToPersonMap: Record<string, string> = {
    'exhibitor@example.com': '1', // Jane Doe
    'jane.doe@example.com': '1',
    'richard@myk9t.com': '1', // Map Richard to Jane Doe (who owns Bella and Lucy) - note: myk9t not myk9l
    'john.smith@example.com': '2',
    'michael.johnson@example.com': '3',
    'sarah.garcia@example.com': '4',
    'david.williams@example.com': '5',
    'dev@example.com': '6', // Development user
    // Secretary and admin users don't have person records in our mock data
  };
  
  const personId = emailToPersonMap[email];
  if (!personId) return null;
  
  const allPeople = useUserStore.getState().people;
  return allPeople.find(p => p.id === personId) || null;
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
    if (hasRole(UserRole.SITE_ADMIN) || 
        hasRole(UserRole.CLUB_ADMIN) || 
        hasRole(UserRole.SECRETARY)) {
      return true;
    }
    
    // Check if user owns this dog
    const dog = dogs.find(d => d.id === dogId);
    if (!dog) return false;
    
    const userPerson = getUserPersonFromEmailStable(userWithRoles.email, allPeople);
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
    if (hasRole(UserRole.SITE_ADMIN) || 
        hasRole(UserRole.CLUB_ADMIN) || 
        hasRole(UserRole.SECRETARY)) {
      return true;
    }
    
    // Exhibitors can only access themselves
    const userPerson = getUserPersonFromEmailStable(userWithRoles.email, allPeople);
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
    
    const userPerson = getUserPersonFromEmailStable(userWithRoles.email, allPeople);
    return userPerson?.id || null;
  }, [userWithRoles, allPeople]);
}