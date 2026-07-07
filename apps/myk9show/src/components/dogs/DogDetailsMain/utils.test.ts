import { describe, expect, it } from 'vitest';
import type { Dog } from '@/types/dog-types';
import { mapDogInputToUpdate } from '@/services/mappers/dogMappers';
import { convertDogToDogInput, parseOptionalDogNumber } from './utils';

const currentDog: Dog = {
  id: 'dog-1',
  name: 'Maple',
  breed: 'Golden Retriever',
  sex: 'female',
  ownerId: 'owner-1',
};

describe('DogDetailsMain utils', () => {
  describe('parseOptionalDogNumber', () => {
    it('returns null for blank values so edited fields can be cleared', () => {
      expect(parseOptionalDogNumber('')).toBeNull();
      expect(parseOptionalDogNumber('   ')).toBeNull();
    });

    it('ignores non-numeric values', () => {
      expect(parseOptionalDogNumber('NaN')).toBeUndefined();
      expect(parseOptionalDogNumber('twenty')).toBeUndefined();
    });

    it('parses finite numeric values', () => {
      expect(parseOptionalDogNumber('21.5')).toBe(21.5);
    });
  });

  it('clears measurements when edited dog measurement fields are blank', () => {
    const input = convertDogToDogInput({ height: '', weight: '' }, currentDog);

    expect(input.height).toBeNull();
    expect(input.weight).toBeNull();
    expect(mapDogInputToUpdate(input)).toEqual(
      expect.objectContaining({
        height: null,
        weight: null,
      })
    );
  });
});
