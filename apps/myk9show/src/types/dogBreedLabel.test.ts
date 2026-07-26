import { describe, it, expect } from 'vitest';
import { getDogBreedLabel, BREED_NOT_SET } from './dog-types';

// MYK9-90 task 2.3. Breed belongs to a registration with a sanctioning
// organization, not to the dog. `getDogBreedLabel` therefore reads the PRIMARY
// registration and has NO `dogs.breed` fallback: a dog with no registration has
// no breed, and the label says so explicitly rather than substituting a value.
describe('getDogBreedLabel', () => {
  it('reads the breed from the registration', () => {
    expect(getDogBreedLabel({ registrations: [{ breed: 'Golden Retriever' }] })).toBe(
      'Golden Retriever'
    );
  });

  it('prefers the primary registration, not merely the first row', () => {
    expect(
      getDogBreedLabel({
        registrations: [
          { id: 'a', breed: 'Poodle', created_at: '2024-01-01T00:00:00Z' },
          {
            id: 'b',
            breed: 'Belgian Malinois',
            created_at: '2024-06-01T00:00:00Z',
            is_primary: true,
          },
        ],
      })
    ).toBe('Belgian Malinois');
  });

  it('falls back to the earliest-created registration when none is marked primary', () => {
    expect(
      getDogBreedLabel({
        registrations: [
          { id: 'b', breed: 'Belgian Malinois', created_at: '2024-06-01T00:00:00Z' },
          { id: 'a', breed: 'Poodle', created_at: '2024-01-01T00:00:00Z' },
        ],
      })
    ).toBe('Poodle');
  });

  it('NEVER falls back to dogs.breed — the dog record is not a breed claim', () => {
    // Each of these previously returned 'Poodle' off `dogs.breed`. Section 6
    // drops that column; nothing may read it, and nothing may substitute for it.
    expect(getDogBreedLabel({ breed: 'Poodle', registrations: [{ breed: '' }] })).toBe(
      BREED_NOT_SET
    );
    expect(getDogBreedLabel({ breed: 'Poodle' })).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ breed: 'Poodle', registrations: [{ breed: 'Unknown' }] })).toBe(
      BREED_NOT_SET
    );
  });

  it('does not invent a breed for an unregistered dog', () => {
    expect(getDogBreedLabel({})).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ registrations: [] })).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ registrations: null })).toBe(BREED_NOT_SET);
  });

  it('treats a legacy stored "Unknown" as a placeholder, not a real breed', () => {
    expect(getDogBreedLabel({ registrations: [{ breed: 'Unknown' }] })).toBe(BREED_NOT_SET);
    expect(getDogBreedLabel({ registrations: [{ breed: 'unknown' }] })).toBe(BREED_NOT_SET);
  });

  it('preserves "Mixed Breed" when it is a real recorded registration breed', () => {
    // 'Mixed Breed' is a legitimate selectable registration breed. What is
    // forbidden is SUBSTITUTING it for an absent one, which no path can now do.
    expect(getDogBreedLabel({ registrations: [{ breed: 'Mixed Breed' }] })).toBe('Mixed Breed');
  });

  it('ignores whitespace-only breeds', () => {
    expect(getDogBreedLabel({ registrations: [{ breed: '   ' }] })).toBe(BREED_NOT_SET);
  });
});
