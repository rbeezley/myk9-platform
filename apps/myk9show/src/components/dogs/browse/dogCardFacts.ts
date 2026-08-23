import { formatDogAge, getDogBreedLabel } from '@/types/dog-types';

/**
 * Which facts a dog card spends its two lines of text on.
 *
 * MYK9-219: every card in the exhibitor's My Dogs grid rendered the owner
 * line — the viewer's own name, on the viewer's own dogs — while showing no
 * breed and no age. `useRoleBasedDogs` scopes an exhibitor-only roster to dogs
 * that person owns, so the owner line on that surface is not merely redundant,
 * it is redundant by construction and can never carry new information.
 *
 * Secretaries and admins see every dog on the platform, where owner is the
 * fact they are most often scanning for, so it stays.
 */
export type DogCardFactKind = 'breed' | 'age' | 'owner';

export interface DogCardFact {
  kind: DogCardFactKind;
  text: string;
}

export interface DogCardFactOptions {
  /**
   * False on the exhibitor-only roster, where every dog belongs to the viewer.
   */
  showOwner: boolean;
  /** Reference instant for the age calculation; injectable for tests. */
  now?: Date;
}

/**
 * Structural, and derived from the two formatters rather than from `Dog`, so a
 * caller holding a mapped row or a partial does not need a cast and the shape
 * cannot drift from what the formatters actually read.
 */
export type DogCardFactSource = Parameters<typeof getDogBreedLabel>[0] &
  Parameters<typeof formatDogAge>[0] & { ownerName?: string | null | undefined };

export function getDogCardFacts(
  dog: DogCardFactSource,
  { showOwner, now }: DogCardFactOptions
): DogCardFact[] {
  const facts: DogCardFact[] = [];

  // Always the shared formatter, never `dog.breed` — the exhibitor-ux-remediation
  // change (tasks 2.1/2.2) requires one stored value to render one way across
  // the My Dogs list, the dog record and the wizard, and requires that a dog
  // with no registration is never given a substitute breed. `getDogBreedLabel`
  // is that formatter; its empty state reads as an absence, not a breed.
  facts.push({ kind: 'breed', text: getDogBreedLabel(dog) });

  const age = now ? formatDogAge(dog, now) : formatDogAge(dog);
  if (age) facts.push({ kind: 'age', text: age });

  if (showOwner && dog.ownerName) facts.push({ kind: 'owner', text: dog.ownerName });

  return facts;
}
