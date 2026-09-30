import { describe, it, expect } from 'vitest';
import { rankBreedMatches } from '../rankBreedMatches';
import { getBreedNamesForOrganization } from '@/data/breedData';

const BREEDS = [
  'Beagle',
  'Border Collie',
  'Golden Retriever',
  'Gordon Setter',
  'Labrador Retriever',
];

describe('rankBreedMatches', () => {
  it('returns the list unchanged for an empty or blank query', () => {
    expect(rankBreedMatches(BREEDS, '')).toEqual(BREEDS);
    expect(rankBreedMatches(BREEDS, '  ')).toEqual(BREEDS);
  });

  it('treats a single letter as a jump to breeds starting with it', () => {
    expect(rankBreedMatches(BREEDS, 'G')).toEqual(['Golden Retriever', 'Gordon Setter']);
  });

  it('ranks prefix matches before word-start and substring matches', () => {
    expect(
      rankBreedMatches(['Cocker Spaniel', 'Border Collie', 'Rancocas', 'Coonhound'], 'co')
    ).toEqual(['Cocker Spaniel', 'Coonhound', 'Border Collie', 'Rancocas']);
  });

  it('keeps plain substring search for longer queries', () => {
    expect(rankBreedMatches(BREEDS, 'retriever')).toEqual([
      'Golden Retriever',
      'Labrador Retriever',
    ]);
  });

  it('puts Golden Retriever first-ish for "G" on the real AKC list', () => {
    const result = rankBreedMatches(getBreedNamesForOrganization('AKC'), 'G');
    expect(result).toContain('Golden Retriever');
    expect(result.every(b => b.toLowerCase().startsWith('g'))).toBe(true);
  });
});
