import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useUserStore } from '@/store/userStore';
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { UserRole } from '@/types/auth-types';
import { selectOwnedDogs } from '@/utils/dogOwnership';
import { rosterIsOwnDogsOnly } from '@/utils/dogRosterScope';
import { getUserPersonFromAuthId, resolveViewerPersonId } from '@/utils/viewerPerson';

// Re-export the pure predicate from the hook module for existing consumers.
export { rosterIsOwnDogsOnly } from '@/utils/dogRosterScope';

/** Hook form of {@link rosterIsOwnDogsOnly} for components. */
export function useRosterIsOwnDogsOnly(): boolean {
  const { hasRole } = useAuthContext();
  return rosterIsOwnDogsOnly(hasRole);
}

/**
 * Hook to filter data based on user's role
 * - Exhibitors (and judges, stewards, chairmen): Only see their own dogs
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
    if (!rosterIsOwnDogsOnly(hasRole)) {
      return allDogs;
    }

    // Exhibitors only see their own dogs. Prefer the canonical people.id from RBAC;
    // the auth id lookup is only for legacy sessions that predate databaseUserId.
    const userPersonId = resolveViewerPersonId(userWithRoles, allPeople);

    if (!userPersonId) {
      return [];
    }

    return selectOwnedDogs(allDogs, userPersonId);
  }, [userWithRoles, allDogs, allPeople, hasRole, isLoading, error]);

  return filteredDogs;
}

export function useRoleBasedPeople() {
  const { userWithRoles, hasRole } = useAuthContext();
  const { data: allPeople = [], isLoading, error, refetch } = useUsersQuery();

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

  return { people: filteredPeople, isLoading, error: error as Error | null, refetch };
}

/**
 * Whether the viewer may open one record, with "not decided yet" kept apart from
 * "no". An unresolved identity (no RBAC yet, or no `people` row for the viewer yet)
 * must never read as a refusal, or a cold boot tells a person their own record
 * does not exist (MYK9-930 review).
 *
 * `missing` is a record that is on no roster at all, for a viewer who would
 * otherwise be checked against ownership.
 */
export type RecordAccess = 'unresolved' | 'allowed' | 'denied' | 'missing';

function isStaffViewer(hasRole: (role: UserRole) => boolean): boolean {
  return (
    hasRole(UserRole.SITE_ADMIN) || hasRole(UserRole.CLUB_ADMIN) || hasRole(UserRole.SECRETARY)
  );
}

export function useDogAccess(dogId: string): RecordAccess {
  const { userWithRoles, hasRole } = useAuthContext();
  const { dogs } = useDogStoreCompat();
  const allPeople = useUserStore(state => state.people);

  return useMemo(() => {
    if (!userWithRoles) return 'unresolved';
    if (isStaffViewer(hasRole)) return 'allowed';

    const viewerPersonId = resolveViewerPersonId(userWithRoles, allPeople);
    if (!viewerPersonId) return 'unresolved';

    const dog = dogs.find(d => d.id === dogId);
    if (!dog) return 'missing';
    return dog.ownerId === viewerPersonId ? 'allowed' : 'denied';
  }, [userWithRoles, hasRole, dogs, dogId, allPeople]);
}

export function usePersonAccess(personId: string): RecordAccess {
  const { userWithRoles, hasRole } = useAuthContext();
  const allPeople = useUserStore(state => state.people);

  return useMemo(() => {
    if (!userWithRoles) return 'unresolved';
    if (isStaffViewer(hasRole)) return 'allowed';

    const viewerPersonId = resolveViewerPersonId(userWithRoles, allPeople);
    if (!viewerPersonId) return 'unresolved';
    return personId === viewerPersonId ? 'allowed' : 'denied';
  }, [userWithRoles, hasRole, personId, allPeople]);
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

    const userPersonId = resolveViewerPersonId(userWithRoles, allPeople);
    return dog.ownerId === userPersonId;
  }, [userWithRoles, hasRole, dogs, dogId, allPeople]);
}

/**
 * Hook to check if the current user may DELETE a specific dog.
 *
 * Mirrors the `soft_delete_dog` RPC permission gate (owner / co-owner / site
 * admin) so the UI hides the action instead of letting it fail server-side.
 * Deliberately NARROWER than useCanAccessDog: secretaries and club admins can
 * *view* any dog but the RPC rejects their delete, so they must not see it.
 *
 * Co-owner included (MYK9-934, owner decision 2026-10-02): the UI gate is
 * exactly the RPC's, so a co-owner sees Delete. No role grants it: a secretary
 * or club admin passes only as the dog's owner or co-owner.
 */
export function useCanDeleteDog(dogId: string): boolean {
  const { userWithRoles, hasRole } = useAuthContext();
  const { dogs } = useDogStoreCompat();
  const allPeople = useUserStore(state => state.people);

  return useMemo(() => {
    if (!userWithRoles) return false;
    if (hasRole(UserRole.SITE_ADMIN)) return true;

    const dog = dogs.find(d => d.id === dogId);
    if (!dog) return false;

    const userPersonId = resolveViewerPersonId(userWithRoles, allPeople);
    return !!userPersonId && (dog.ownerId === userPersonId || dog.coOwnerId === userPersonId);
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
    const userPersonId = resolveViewerPersonId(userWithRoles, allPeople);
    return personId === userPersonId;
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
    if (userWithRoles.databaseUserId) return userWithRoles.databaseUserId;

    const userPerson = getUserPersonFromAuthId(userWithRoles.id, allPeople);
    return userPerson?.id || null;
  }, [userWithRoles, allPeople]);
}
