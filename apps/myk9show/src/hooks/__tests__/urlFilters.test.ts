import { describe, it, expect } from 'vitest';
import { applyUrlFilters, changedFilterKeys, parseUrlFilters } from '@/hooks/urlFilters';

// The real `INITIAL_FILTERS` shape from useBrowseDogsData.
interface DogFilters {
  search: string;
  breed: string;
  sex: string;
}

const DOG_DEFAULTS: DogFilters = { search: '', breed: 'all', sex: 'all' };

describe('parseUrlFilters', () => {
  it('reads each filter key out of the query string', () => {
    const values = parseUrlFilters(
      new URLSearchParams('search=max&breed=Poodle&sex=female'),
      DOG_DEFAULTS
    );
    expect(values).toEqual({ search: 'max', breed: 'Poodle', sex: 'female' });
  });

  it('falls back to the default for a missing key', () => {
    const values = parseUrlFilters(new URLSearchParams('breed=Poodle'), DOG_DEFAULTS);
    expect(values).toEqual({ search: '', breed: 'Poodle', sex: 'all' });
  });

  it('falls back to the default for a present-but-empty key', () => {
    // `?breed=` must not put the page in a state no chip can represent.
    const values = parseUrlFilters(new URLSearchParams('breed='), DOG_DEFAULTS);
    expect(values.breed).toBe('all');
  });

  it('ignores params it does not own', () => {
    const values = parseUrlFilters(new URLSearchParams('add=true&tab=managing'), DOG_DEFAULTS);
    expect(values).toEqual({ search: '', breed: 'all', sex: 'all' });
  });
});

describe('applyUrlFilters', () => {
  it('writes only the non-default values', () => {
    const next = applyUrlFilters(
      new URLSearchParams(''),
      { search: 'max', breed: 'all', sex: 'female' },
      DOG_DEFAULTS
    );
    expect(next.get('search')).toBe('max');
    expect(next.get('sex')).toBe('female');
    expect(next.has('breed')).toBe(false);
  });

  it('deletes a filter that has been reset to its default', () => {
    const next = applyUrlFilters(
      new URLSearchParams('breed=Poodle&sex=female'),
      { search: '', breed: 'all', sex: 'female' },
      DOG_DEFAULTS
    );
    expect(next.has('breed')).toBe(false);
    expect(next.get('sex')).toBe('female');
  });

  it('preserves ?add=true and every other param it does not own', () => {
    const next = applyUrlFilters(
      new URLSearchParams('add=true&tab=managing&view=cards'),
      { search: 'max', breed: 'all', sex: 'all' },
      DOG_DEFAULTS
    );
    expect(next.get('add')).toBe('true');
    expect(next.get('tab')).toBe('managing');
    expect(next.get('view')).toBe('cards');
    expect(next.get('search')).toBe('max');
  });

  it('preserves unrelated params when a filter is cleared as well', () => {
    const next = applyUrlFilters(
      new URLSearchParams('add=true&breed=Poodle'),
      { search: '', breed: 'all', sex: 'all' },
      DOG_DEFAULTS
    );
    expect(next.get('add')).toBe('true');
    expect(next.has('breed')).toBe(false);
  });

  it('does not mutate the params it was given', () => {
    const original = new URLSearchParams('add=true');
    applyUrlFilters(original, { search: 'max', breed: 'all', sex: 'all' }, DOG_DEFAULTS);
    expect(original.has('search')).toBe(false);
    expect(original.get('add')).toBe('true');
  });
});

describe('changedFilterKeys', () => {
  it('ignores keys that are not filter keys', () => {
    const a = { search: 'max', breed: 'all', sex: 'all', extra: 'x' };
    const b = { search: 'max', breed: 'all', sex: 'all', extra: 'y' };
    // `extra` is not a filter key, so it must not register as a change.
    expect(changedFilterKeys<DogFilters>(a, b, DOG_DEFAULTS)).toEqual([]);
  });

  it('reports every differing key', () => {
    expect(
      changedFilterKeys(
        { search: 'max', breed: 'Poodle', sex: 'all' },
        { search: '', breed: 'all', sex: 'all' },
        DOG_DEFAULTS
      ).sort()
    ).toEqual(['breed', 'search']);
  });

  it('reports no change when the values match', () => {
    expect(changedFilterKeys({ ...DOG_DEFAULTS }, { ...DOG_DEFAULTS }, DOG_DEFAULTS)).toEqual([]);
  });
});
