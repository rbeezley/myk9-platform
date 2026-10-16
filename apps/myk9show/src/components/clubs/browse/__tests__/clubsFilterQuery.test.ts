import { describe, expect, it } from 'vitest';
import { clubsFilterQuery } from '../clubsFilterQuery';

describe('clubsFilterQuery', () => {
  it('is empty with no search', () => {
    expect(clubsFilterQuery('')).toBe('');
  });

  it('encodes the search, spaces and ampersands included', () => {
    expect(clubsFilterQuery('Bay & Valley')).toBe('?search=Bay+%26+Valley');
  });
});
