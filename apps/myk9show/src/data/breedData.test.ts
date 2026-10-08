import { describe, it, expect } from 'vitest';
import {
  AKC_BREEDS,
  UKC_BREEDS,
  FCI_BREEDS,
  CKC_BREEDS,
  KC_BREEDS,
  getGroupForBreed,
} from './breedData';

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

    it('includes Silken Windhound and Miscellaneous Class breeds', () => {
      expect(getGroupForBreed('AKC', 'Silken Windhound')).toBe('Hound');
      expect(getGroupForBreed('AKC', 'Teddy Roosevelt Terrier')).toBe('Terrier');
      expect(getGroupForBreed('AKC', 'Alaskan Klee Kai')).toBe('Non-Sporting');
    });
  });

  describe('UKC_BREEDS', () => {
    it('includes Silken Windhound in Sighthound & Pariah Dog', () => {
      expect(getGroupForBreed('UKC', 'Silken Windhound')).toBe('Sighthound & Pariah Dog');
    });

    it('includes AMBOR as the mixed-breed designation', () => {
      const ambor = UKC_BREEDS.find(breed => breed.name === 'AMBOR');
      expect(ambor?.group).toBe('Mixed Breed');
    });

    it('treats the Belgians as one breed with four varieties (AKC keeps four breeds)', () => {
      const ukcNames = UKC_BREEDS.map(b => b.name);
      expect(UKC_BREEDS.find(b => b.name === 'Belgian Shepherd Dog')?.varieties).toEqual([
        'Groenendael',
        'Laekenois',
        'Malinois',
        'Tervuren',
      ]);
      expect(ukcNames).not.toContain('Belgian Malinois');
      const akcBelgians = AKC_BREEDS.map(b => b.name).filter(n => n.startsWith('Belgian'));
      expect(akcBelgians).toEqual([
        'Belgian Laekenois',
        'Belgian Malinois',
        'Belgian Sheepdog',
        'Belgian Tervuren',
      ]);
    });

    it('uses UKC official names', () => {
      const names = UKC_BREEDS.map(b => b.name);
      expect(names).toContain('Shiba');
      expect(names).toContain('Standard Poodle');
      expect(names).toContain('Belgian Shepherd Dog');
      expect(names).not.toContain('Shiba Inu');
    });
  });

  describe.each([
    ['AKC', AKC_BREEDS],
    ['UKC', UKC_BREEDS],
    ['CKC', CKC_BREEDS],
    ['FCI', FCI_BREEDS],
    ['KC', KC_BREEDS],
  ])('%s list integrity', (org, breeds) => {
    it(`${org} has no duplicate breed names`, () => {
      const names = breeds.map(b => b.name);
      const dupes = names.filter((n, i) => names.indexOf(n) !== i);
      expect(dupes).toEqual([]);
    });
  });
});
