import { describe, it, expect } from 'vitest';
import { getDogBreedLabel, BREED_NOT_SET } from './dog-types';

describe('getDogBreedLabel', () => {
  it('prefers a registration breed over the dog breed', () => {
    expect(
      getDogBreedLabel({ breed: 'Poodle', registrations: [{ breed: 'Golden Retriever' }] })
    ).toBe('Golden Retriever');
  });

  it('falls back to the dog breed when no registration breed is meaningful', () => {
    expect(getDogBreedLabel({ breed: 'Poodle', registrations: [{ breed: '' }] })).toBe('Poodle');
    expect(getDogBreedLabel({ breed: 'Poodle' })).toBe('Poodle');
  });

  it('returns the shared placeholder when breed is genuinely unset', () => {
    expect(getDogBreedLabel({ breed: '' })).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ breed: null })).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({})).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ registrations: [] })).toBe(BREED_NOT_SET);
  });

  it('treats a legacy stored "Unknown" as a placeholder, not a real breed', () => {
    expect(getDogBreedLabel({ breed: 'Unknown' })).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ breed: 'unknown' })).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ breed: 'Poodle', registrations: [{ breed: 'Unknown' }] })).toBe(
      'Poodle'
    );
  });

  it('preserves "Mixed Breed" as a real, selectable breed', () => {
    expect(getDogBreedLabel({ breed: 'Mixed Breed' })).toBe('Mixed Breed');
  });

  it('ignores whitespace-only breeds', () => {
    expect(getDogBreedLabel({ breed: '   ' })).toBe(BREED_NOT_SET);
  });
});
