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

  it('for a single letter lists prefix matches, then word-start matches, never mid-word', () => {
    expect(rankBreedMatches(BREEDS, 'G')).toEqual(['Golden Retriever', 'Gordon Setter']);
    expect(rankBreedMatches(BREEDS, 'r')).toEqual(['Golden Retriever', 'Labrador Retriever']);
    expect(rankBreedMatches(['Beagle', 'Rottweiler', 'Golden Retriever'], 'r')).toEqual([
      'Rottweiler',
      'Golden Retriever',
    ]);
  });

  it('treats hyphen and "(" as word boundaries for any query length', () => {
    expect(rankBreedMatches(['Chinese Shar-Pei', 'Beagle'], 'pei')).toEqual(['Chinese Shar-Pei']);
    expect(rankBreedMatches(['Dachshund (Miniature)', 'Beagle'], 'mini')).toEqual([
      'Dachshund (Miniature)',
    ]);
    expect(rankBreedMatches(['Chinese Shar-Pei'], 'p')).toEqual(['Chinese Shar-Pei']);
  });

  it('ignores diacritics on both sides', () => {
    expect(rankBreedMatches(['Löwchen', 'Beagle'], 'low')).toEqual(['Löwchen']);
    expect(rankBreedMatches(['Lowchen'], 'löw')).toEqual(['Lowchen']);
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
    const firstNonPrefix = result.findIndex(b => !b.toLowerCase().startsWith('g'));
    const prefixCount = firstNonPrefix === -1 ? result.length : firstNonPrefix;
    expect(result.slice(0, prefixCount).length).toBeGreaterThan(1);
    // Once a non-prefix (word-start) match appears, no prefix match follows it.
    expect(result.slice(prefixCount).some(b => b.toLowerCase().startsWith('g'))).toBe(false);
    expect(result.indexOf('Golden Retriever')).toBeLessThan(prefixCount);
  });
});
