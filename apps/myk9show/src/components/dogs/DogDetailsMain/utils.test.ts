import { describe, expect, it } from 'vitest';
import type { Dog } from '@/types/dog-types';
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
    it('ignores blank values', () => {
      expect(parseOptionalDogNumber('')).toBeUndefined();
      expect(parseOptionalDogNumber('   ')).toBeUndefined();
    });

    it('ignores non-numeric values', () => {
      expect(parseOptionalDogNumber('NaN')).toBeUndefined();
      expect(parseOptionalDogNumber('twenty')).toBeUndefined();
    });

    it('parses finite numeric values', () => {
      expect(parseOptionalDogNumber('21.5')).toBe(21.5);
    });
  });

  it('does not save NaN measurements when dog measurement fields are cleared', () => {
    const input = convertDogToDogInput({ height: '', weight: '' }, currentDog);

    expect(input).not.toHaveProperty('height');
    expect(input).not.toHaveProperty('weight');
  });
});
