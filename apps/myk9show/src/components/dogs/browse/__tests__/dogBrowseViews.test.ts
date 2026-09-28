import { describe, expect, it } from 'vitest';
import type { Dog } from '@/types/dog-types';
import { DEFAULT_DOG_FILTERS } from '../dogBrowseFilters';
import { activeDogViewId, buildDogViews, dogViewFilters } from '../dogBrowseViews';

function dog(overrides: Partial<Dog> & { id: string }): Dog {
  return {
    name: overrides.id,
    callName: overrides.id,
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    ...overrides,
  } as Dog;
}

const DOGS: Dog[] = [
  dog({ id: 'a', status: 'active' }),
  dog({ id: 'b' }), // no status recorded -> counts as active
  dog({ id: 'c', status: 'retired' }),
  dog({ id: 'd', status: 'deceased' }),
];

describe('buildDogViews', () => {
  it('counts every view over the whole roster', () => {
    const views = buildDogViews(DOGS);
    expect(views).toEqual([
      { id: 'all', label: 'All', count: 4 },
      { id: 'active', label: 'Active', count: 2 },
      { id: 'retired', label: 'Retired', count: 1 },
      { id: 'deceased', label: 'Deceased', count: 1 },
    ]);
  });

  it('ignores the current search when counting — counts describe the whole roster', () => {
    // buildDogViews takes no search argument at all: it always counts blind to
    // whatever the roster's own search box currently holds.
    const views = buildDogViews(DOGS);
    expect(views.find(v => v.id === 'all')?.count).toBe(4);
  });
});

describe('activeDogViewId', () => {
  it('matches "all" at the defaults', () => {
    expect(activeDogViewId(DEFAULT_DOG_FILTERS)).toBe('all');
  });

  it('matches the view whose status preset equals the current filters', () => {
    expect(activeDogViewId({ ...DEFAULT_DOG_FILTERS, status: 'retired' })).toBe('retired');
  });

  it('stays matched to a view while only search differs', () => {
    expect(activeDogViewId({ ...DEFAULT_DOG_FILTERS, status: 'retired', search: 'rex' })).toBe(
      'retired'
    );
  });

  it('returns null once a non-search filter narrows past the view', () => {
    expect(activeDogViewId({ ...DEFAULT_DOG_FILTERS, status: 'retired', breed: 'Papillon' })).toBe(
      null
    );
  });
});

describe('dogViewFilters', () => {
  it('resets every field to the view preset but keeps the current search', () => {
    const current = { ...DEFAULT_DOG_FILTERS, breed: 'Papillon', search: 'rex' };
    expect(dogViewFilters('retired', current)).toEqual({
      ...DEFAULT_DOG_FILTERS,
      status: 'retired',
      search: 'rex',
    });
  });

  it('falls back to the first view for an unknown id', () => {
    expect(dogViewFilters('nope', DEFAULT_DOG_FILTERS)).toEqual(DEFAULT_DOG_FILTERS);
  });
});
