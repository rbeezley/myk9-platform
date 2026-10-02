import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useUserStore } from '@/store/userStore';
import { resolveViewerPersonId } from '@/utils/viewerPerson';
import type { Dog } from '@/types/dog-types';

/**
 * True when the signed-in viewer is the dog's owner or co-owner.
 *
 * Compares PERSON ids (`dogs.owner_id` / `co_owner_id` reference `people.id`,
 * never the auth uid) using the same resolution as the useRoleBasedData hooks.
 * An unresolved identity is "not an owner", never a match on an undefined id.
 */
export function useViewerOwnsDog(dog: Pick<Dog, 'ownerId' | 'coOwnerId'>): boolean {
  const { userWithRoles } = useAuthContext();
  const people = useUserStore(state => state.people);
  return useMemo(() => {
    const personId = resolveViewerPersonId(userWithRoles, people);
    return !!personId && (dog.ownerId === personId || dog.coOwnerId === personId);
  }, [userWithRoles, people, dog.ownerId, dog.coOwnerId]);
}
