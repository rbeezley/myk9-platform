import { describe, expect, it } from 'vitest';
import type { Dog } from '@/types/dog-types';
import {
  buildDogSearchText,
  DEFAULT_DOG_FILTERS,
  filterDogs,
  hasActiveDogFilters,
} from '../dogBrowseFilters';

function dog(overrides: Partial<Dog> & { id: string }): Dog {
  const breed = overrides.breed ?? 'Border Collie';
  return {
    name: overrides.id,
    callName: overrides.id,
    breed,
    sex: 'female',
    ownerId: 'owner-1',
    ownerName: 'Jane Doe',
    // getDogBreedLabel reads only `registrations`, never the raw `breed`
    // field, so a fixture that wants a specific breed label needs one.
    registrations: [
      {
        id: `reg-${overrides.id}`,
        organization: 'AKC',
        registeredName: overrides.id,
        breed,
        registrationNumber: `AKC-${overrides.id}`,
        status: 'Active',
      },
    ],
    ...overrides,
  } as Dog;
}

describe('filterDogs', () => {
  it('returns every dog when no filter is active', () => {
    const dogs = [dog({ id: 'a' }), dog({ id: 'b' })];
    expect(filterDogs(dogs, DEFAULT_DOG_FILTERS)).toHaveLength(2);
  });

  it('filters by status, treating a missing status as active', () => {
    const dogs = [
      dog({ id: 'a', status: 'active' }),
      dog({ id: 'b', status: 'retired' }),
      dog({ id: 'c' }),
    ];
    expect(filterDogs(dogs, { ...DEFAULT_DOG_FILTERS, status: 'active' }).map(d => d.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('filters by owner', () => {
    const dogs = [dog({ id: 'a', ownerName: 'Jane Doe' }), dog({ id: 'b', ownerName: 'Sam Reed' })];
    expect(filterDogs(dogs, { ...DEFAULT_DOG_FILTERS, owner: 'Sam Reed' }).map(d => d.id)).toEqual([
      'b',
    ]);
  });

  it('ANDs every active field together', () => {
    const dogs = [
      dog({ id: 'a', breed: 'Papillon', sex: 'male', status: 'active', ownerName: 'A' }),
      dog({ id: 'b', breed: 'Papillon', sex: 'female', status: 'active', ownerName: 'A' }),
    ];
    expect(
      filterDogs(dogs, { ...DEFAULT_DOG_FILTERS, breed: 'Papillon', sex: 'male' }).map(d => d.id)
    ).toEqual(['a']);
  });

  it('uses a precomputed search index instead of recomputing per call', () => {
    const dogs = [dog({ id: 'a', callName: 'Rex' }), dog({ id: 'b', callName: 'Fido' })];
    const searchIndex = dogs.map(buildDogSearchText);
    expect(
      filterDogs(dogs, { ...DEFAULT_DOG_FILTERS, search: 'rex' }, searchIndex).map(d => d.id)
    ).toEqual(['a']);
  });
});

describe('hasActiveDogFilters', () => {
  it('is false at defaults', () => {
    expect(hasActiveDogFilters(DEFAULT_DOG_FILTERS)).toBe(false);
  });

  it.each(['search', 'breed', 'sex', 'status', 'owner'] as const)('is true once %s is set', key => {
    const value = key === 'search' ? 'rex' : key === 'status' ? 'active' : 'something';
    expect(hasActiveDogFilters({ ...DEFAULT_DOG_FILTERS, [key]: value })).toBe(true);
  });
});
