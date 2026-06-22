/** Minimal shape needed to test dog ownership. ownerId is optional so this
 *  works with both required-ownerId dog types and the registration generics
 *  whose ownerId is optional.
 *
 *  Note: the property is typed `string | null | undefined` (not the shorthand
 *  `ownerId?`) so that `exactOptionalPropertyTypes: true` allows assigning both
 *  `string | null` (DB dog types) and `string | undefined` (replicated types). */
export interface OwnableDog {
  id: string;
  ownerId?: string | null | undefined;
}

/** Dogs owned by `ownerId`. Empty when ownerId is falsy. Preserves input order. */
export function selectOwnedDogs<T extends OwnableDog>(
  dogs: readonly T[],
  ownerId: string | null | undefined
): T[] {
  if (!ownerId) return [];
  return dogs.filter(dog => dog.ownerId === ownerId);
}

/** Set of ids of dogs owned by `ownerId`. Empty set when ownerId is falsy. */
export function selectOwnedDogIds(
  dogs: readonly OwnableDog[],
  ownerId: string | null | undefined
): Set<string> {
  return new Set(selectOwnedDogs(dogs, ownerId).map(dog => dog.id));
}
