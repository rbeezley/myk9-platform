import type { Dog } from '@/types/dog-types';

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
  if (dog.dateOfBirth) {
    const birthDate = new Date(dog.dateOfBirth);
    const ageInMonths = (new Date().getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (ageInMonths < 6) {
      issues.push('Too young (must be 6+ months)');
    }
  }
  return { eligible: issues.length === 0, issues };
}

/**
 * Dogs this user may enter: soft-deleted and non-active dogs are never
 * selectable, a site admin sees every dog, and everyone else sees only their
 * own. Extracted alongside the eligibility rule so the handoff cannot
 * preselect a dog the picker itself would hide.
 */
export function filterAccessibleDogs(
  dogs: Dog[],
  userId: string | null | undefined,
  isSiteAdmin: boolean
): Dog[] {
  if (!userId) return [];
  return dogs.filter(dog => {
    if (dog.deletedAt) return false;
    if (dog.status && dog.status !== 'active') return false;
    if (isSiteAdmin) return true;
    return dog.ownerId === userId;
  });
}
