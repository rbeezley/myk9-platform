import type { Dog } from '@/types/dog-types';

export type SelectedDogsOwnerResult =
  | { ok: true; ownerId: string }
  | { ok: false; owners: string[] };

/**
 * Compute the unique owner across a set of selected dogs.
 *
 * Returns `{ ok: true, ownerId }` when every selected dog shares the same
 * non-empty `ownerId`. Otherwise returns `{ ok: false, owners }` where
 * `owners.length` tells the caller which failure case applies (>=2:
 * multi-owner cart; <=1: at least one selected dog has no `ownerId`).
 */
export function selectedDogsOwner(dogs: Dog[], selectedDogIds: string[]): SelectedDogsOwnerResult {
  if (selectedDogIds.length === 0) {
    return { ok: false, owners: [] };
  }

  const dogById = new Map(dogs.map(dog => [dog.id, dog]));
  const owners = new Set<string>();
  let hasOrphan = false;

  for (const id of selectedDogIds) {
    const dog = dogById.get(id);
    if (!dog) continue;
    if (!dog.ownerId) {
      hasOrphan = true;
      continue;
    }
    owners.add(dog.ownerId);
  }

  if (!hasOrphan && owners.size === 1) {
    return { ok: true, ownerId: [...owners][0]! };
  }

  return { ok: false, owners: [...owners].sort() };
}
