import type { Dog } from '@/types/dog-types';
import { getAgeInMonths } from '@/hooks/useEntryEligibility';
import { getRegistry, listRegistries } from '@/features/registries';

/**
 * How the picker names the registration number a secretary can search by.
 * `showRegistryId` is the show's one registry, already resolved through
 * `@/features/registries` by the caller; unknown or not yet resolved says
 * "registration number" rather than guessing a registry (MYK9-736). Both the
 * local filter and `searchAllDogs` match a number from any registry.
 */
export function getRegistrationNumberLabel(showRegistryId: string | null | undefined): string {
  const known = listRegistries().find(id => id === showRegistryId);
  return known ? `${getRegistry(known).id} number` : 'registration number';
}

export function addDogSelection(
  selectedDogIds: string[],
  dogId: string,
  maxSelections: number
): string[] {
  if (selectedDogIds.includes(dogId)) return selectedDogIds;
  if (selectedDogIds.length >= maxSelections) return selectedDogIds;
  return [...selectedDogIds, dogId];
}

export function removeDogSelection(selectedDogIds: string[], dogId: string): string[] {
  return selectedDogIds.filter(id => id !== dogId);
}

/**
 * Merge visible dog ids into the existing selected-dog cart.
 * If the merged list exceeds maxSelections, later visible ids are silently dropped.
 */
export function addVisibleDogSelections(
  selectedDogIds: string[],
  visibleDogIds: string[],
  maxSelections: number
): string[] {
  return [...new Set([...selectedDogIds, ...visibleDogIds])].slice(0, maxSelections);
}

export function removeVisibleDogSelections(
  selectedDogIds: string[],
  visibleDogIds: string[]
): string[] {
  const visible = new Set(visibleDogIds);
  return selectedDogIds.filter(id => !visible.has(id));
}

/**
 * The dog step's own eligibility rule, extracted so the MYK9-519 "enter this
 * dog" handoff can ask the SAME question the step asks instead of writing a
 * second policy.
 *
 * Registration is NOT a blocker — mixed-breed dogs routinely have no
 * registration number, and class-level eligibility (including any registration
 * requirements) is validated later in the flow. Mirrors the documented policy
 * in DogSelectionStep.getDogEligibilityStatus, which this enhanced variant had
 * diverged from (2026-06-10 walkthrough).
 */
export function getDogEligibilityStatus(dog: Dog): { eligible: boolean; issues: string[] } {
  const issues: string[] = [];
  // Calendar months via the shared `getAgeInMonths`, NOT days/30. The local
  // 30-day approximation this replaced ran ~1.5% fast, so a dog in the last
  // week before its six-month birthday read as eligible here while
  // `DogSelectionStep` — which has always used `getAgeInMonths` — showed the
  // same dog greyed out. The MYK9-519 handoff asks this function, so the
  // divergence would have preselected a dog the picker refuses.
  if (dog.dateOfBirth && getAgeInMonths(dog.dateOfBirth) < 6) {
    issues.push('Too young (must be 6+ months)');
  }
  return { eligible: issues.length === 0, issues };
}

/**
 * A dog the picker will offer at all: soft-deleted and non-active dogs are
 * never selectable, whoever is looking. Extracted alongside the eligibility
 * rule so the MYK9-519 handoff cannot preselect a dog the picker itself hides.
 *
 * Deliberately says nothing about ownership. The wizard's roster is already
 * scoped to what the signed-in user may enter, and `dog.ownerId` is a
 * `people.id` — NOT the auth user id that `useRegistrationPermissions()`
 * returns — so an ownership comparison belongs only where that mapping is
 * actually resolved.
 */
export function isDogSelectable(dog: Dog): boolean {
  if (dog.deletedAt) return false;
  if (dog.status && dog.status !== 'active') return false;
  return true;
}

/**
 * Dogs the secretary/admin search panel may offer from the locally replicated
 * roster: selectable, and nothing else.
 *
 * MYK9-537: this deliberately applies NO client-side ownership filter.
 *
 * 1. The comparison it replaces (`dog.ownerId === userId`) compared a
 *    `people.id` with an `auth.users` id. Those are separate id spaces that
 *    never coincide, so the branch emptied the roster for every viewer who
 *    was not a site admin.
 * 2. Filtering by ownership here would be wrong even if the ids matched. The
 *    roster is already scoped server-side: `useDogsQuery` calls
 *    `getAllDogs(personId, showAll)` with `showAll = !rosterIsOwnDogsOnly()`,
 *    on top of the dogs/people RLS that lets `is_show_manager()` read all
 *    dogs. The server has already decided what this viewer may see.
 * 3. This component renders only under `features.advancedSearch`, i.e. exactly
 *    the `secretary_new | club_admin | site_admin` workflow modes — the same
 *    set as `ROLES_WITH_FULL_DOG_ROSTER`. Every viewer here is staff entering
 *    on someone else's behalf, so "not mine" is never a reason to hide a dog.
 *
 * Same rule the MYK9-519 handoff already applies in `useEntryDogHandoff`,
 * which narrows the roster with `isDogSelectable` alone.
 */
export function filterAccessibleDogs(dogs: Dog[]): Dog[] {
  return dogs.filter(isDogSelectable);
}
