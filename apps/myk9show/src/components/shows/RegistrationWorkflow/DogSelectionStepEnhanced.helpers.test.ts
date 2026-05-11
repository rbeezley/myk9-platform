import { describe, expect, it } from 'vitest';
import {
  addDogSelection,
  addVisibleDogSelections,
  removeDogSelection,
  removeVisibleDogSelections,
} from './DogSelectionStepEnhanced.helpers';

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
