import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useDogStoreCompat } from '@/hooks/useDogStoreCompat';
import { useUserStore } from '@/store/userStore';
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { selectOwnedDogs } from '@/utils/dogOwnership';

/**
 * The roles whose dog roster is the whole platform. Everyone else — exhibitor,
 * judge, steward, chairman — is scoped to dogs they own, which is a broader set
 * of roles than "exhibitor" and the reason this is a named predicate rather
 * than a role comparison at each call site.
 */
const ROLES_WITH_FULL_DOG_ROSTER: readonly UserRole[] = [
  UserRole.SITE_ADMIN,
  UserRole.CLUB_ADMIN,
  UserRole.SECRETARY,
];

/**
 * True when the viewer's dog roster is scoped to dogs they own.
 *
 * The single source of truth for that question: `useRoleBasedDogs` below
 * decides the scope with it, and any surface that changes what it renders
 * because "these are all my own dogs" must ask the same question rather than
 * approximating it. Approximating it with `getPrimaryRole(...) === EXHIBITOR`
 * is wrong, because `USER_ROLE_HIERARCHY` ranks JUDGE, CLUB_ADMIN, CHAIRMAN and
 * STEWARD above EXHIBITOR — so a judge holding both roles has a primary role of
 * JUDGE, is not elevated here, and still sees only their own dogs (MYK9-219
 * review).
 */
export function rosterIsOwnDogsOnly(hasRole: (role: UserRole) => boolean): boolean {
  return !ROLES_WITH_FULL_DOG_ROSTER.some(role => hasRole(role));
}

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
    const userPersonId =
      userWithRoles.databaseUserId ?? getUserPersonFromAuthId(userWithRoles.id, allPeople)?.id;

    if (!userPersonId) {
      return [];
    }

    return selectOwnedDogs(allDogs, userPersonId);
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

    const userPersonId =
      userWithRoles.databaseUserId ?? getUserPersonFromAuthId(userWithRoles.id, allPeople)?.id;
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
 * Co-owner is omitted: no dogs currently set co_owner_id and it is not on the
 * Dog type. Revisit if co-ownership ships (the RPC already allows it).
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

    const userPersonId =
      userWithRoles.databaseUserId ?? getUserPersonFromAuthId(userWithRoles.id, allPeople)?.id;
    return !!userPersonId && dog.ownerId === userPersonId;
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
    const userPersonId =
      userWithRoles.databaseUserId ?? getUserPersonFromAuthId(userWithRoles.id, allPeople)?.id;
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
