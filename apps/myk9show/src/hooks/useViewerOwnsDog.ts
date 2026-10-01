import { useAuthContext } from '@/hooks/useAuthContext';
import { useUserStore } from '@/store/userStore';
import type { Dog } from '@/types/dog-types';

/**
 * True when the signed-in viewer is the dog's owner or co-owner.
 *
 * Compares PERSON ids: `dogs.owner_id` / `co_owner_id` reference `people.id`,
 * which is never the auth uid. The person id comes from the user row
 * (`databaseUserId`) or, failing that, the people store row whose `user_id` is
 * the auth uid. An unresolved identity is "not an owner", never a match on an
 * undefined id.
 */
export function useViewerOwnsDog(dog: Pick<Dog, 'ownerId' | 'coOwnerId'>): boolean {
  const { userWithRoles } = useAuthContext();
  const people = useUserStore(state => state.people);
  const authId = userWithRoles?.id;
  const personId =
    userWithRoles?.databaseUserId ??
    (authId ? people.find(p => p.user_id === authId)?.id : undefined);
  if (!personId) return false;
  return dog.ownerId === personId || dog.coOwnerId === personId;
}
