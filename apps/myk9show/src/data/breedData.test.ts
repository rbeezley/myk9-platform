import { describe, it, expect } from 'vitest';
import { AKC_BREEDS } from './breedData';

describe('breedData', () => {
  describe('AKC_BREEDS', () => {
    it('should include Dutch Shepherd', () => {
      const dutchShepherd = AKC_BREEDS.find(breed => breed.name === 'Dutch Shepherd');
      expect(dutchShepherd).toBeDefined();
    });

    it('Dutch Shepherd should have three varieties', () => {
      const dutchShepherd = AKC_BREEDS.find(breed => breed.name === 'Dutch Shepherd');
      expect(dutchShepherd?.varieties).toEqual(['Short Hair', 'Long Hair', 'Wire Hair']);
    });

    it('Dutch Shepherd should be in the Herding group', () => {
      const dutchShepherd = AKC_BREEDS.find(breed => breed.name === 'Dutch Shepherd');
      expect(dutchShepherd?.group).toBe('Herding');
    });
  });
});
