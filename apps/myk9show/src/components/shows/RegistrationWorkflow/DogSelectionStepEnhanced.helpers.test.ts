import { describe, expect, it } from 'vitest';
import type { Dog } from '@/types/dog-types';
import {
  addDogSelection,
  addVisibleDogSelections,
  getDogEligibilityStatus,
  removeDogSelection,
  removeVisibleDogSelections,
} from './DogSelectionStepEnhanced.helpers';

/** `n` calendar months before today, as the YYYY-MM-DD the roster stores. */
function birthdayMonthsAgo(months: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

describe('DogSelectionStepEnhanced selection helpers', () => {
  it('adds one dog without dropping dogs selected from previous searches', () => {
    expect(addDogSelection(['dog-ace', 'dog-bravo'], 'dog-charlie', 50)).toEqual([
      'dog-ace',
      'dog-bravo',
      'dog-charlie',
    ]);
  });

  it('does not add beyond the max selection count', () => {
    expect(addDogSelection(['dog-ace', 'dog-bravo'], 'dog-charlie', 2)).toEqual([
      'dog-ace',
      'dog-bravo',
    ]);
  });

  it('adds visible bulk selections to the existing cart', () => {
    expect(addVisibleDogSelections(['dog-ace'], ['dog-bravo', 'dog-charlie'], 50)).toEqual([
      'dog-ace',
      'dog-bravo',
      'dog-charlie',
    ]);
  });

  it('silently drops overflow visible bulk selections past the max selection count', () => {
    expect(addVisibleDogSelections(['dog-ace'], ['dog-bravo', 'dog-charlie'], 2)).toEqual([
      'dog-ace',
      'dog-bravo',
    ]);
  });

  it('removes only the visible selections when toggling visible dogs off', () => {
    expect(
      removeVisibleDogSelections(['dog-ace', 'dog-bravo', 'dog-charlie'], ['dog-bravo'])
    ).toEqual(['dog-ace', 'dog-charlie']);
  });

  it('removes one selected dog', () => {
    expect(removeDogSelection(['dog-ace', 'dog-bravo'], 'dog-ace')).toEqual(['dog-bravo']);
  });
});

describe('getDogEligibilityStatus', () => {
  const dog = (dateOfBirth?: string) => ({ id: 'dog-1', dateOfBirth }) as Dog;

  it('accepts a dog with no date of birth on file', () => {
    expect(getDogEligibilityStatus(dog())).toEqual({ eligible: true, issues: [] });
  });

  it('accepts a dog well past six months', () => {
    expect(getDogEligibilityStatus(dog(birthdayMonthsAgo(14))).eligible).toBe(true);
  });

  // Counted in calendar months by the shared `getAgeInMonths`, the same
  // function `DogSelectionStep` uses. The local days/30 approximation this
  // replaced disagreed with it by up to a month in both directions, and the
  // MYK9-519 handoff asks THIS function while the exhibitor sees that picker.
  it('refuses a dog under six calendar months, in the picker wording', () => {
    const status = getDogEligibilityStatus(dog(birthdayMonthsAgo(3)));
    expect(status.eligible).toBe(false);
    expect(status.issues).toEqual(['Too young (must be 6+ months)']);
  });
});
