import { describe, expect, it } from 'vitest';
import type { Dog } from '@/types/dog-types';
import { matchesDogSearch } from './dogSearchMatch';

function dog(overrides: Partial<Dog>): Dog {
  return { id: 'dog-1', name: 'Rex', callName: 'Rex', ...overrides } as Dog;
}

describe('matchesDogSearch (MYK9-2020)', () => {
  it('matches an owner name from words that are not one contiguous run', () => {
    expect(matchesDogSearch(dog({ ownerName: 'Mary Jane Smith' }), 'Mary Ja Smith')).toBe(true);
  });

  it('matches words found in different fields', () => {
    const rex = dog({
      registrations: [
        { organization: 'AKC', registrationNumber: 'SW1', breed: 'Labrador Retriever' },
      ] as Dog['registrations'],
    });
    expect(matchesDogSearch(rex, 'rex lab')).toBe(true);
  });

  it('excludes the dog when one word matches nothing', () => {
    expect(matchesDogSearch(dog({ ownerName: 'Mary Jane Smith' }), 'mary zzz')).toBe(false);
  });

  it('matches a registration number and a registered name, case-insensitively', () => {
    const rex = dog({
      registrations: [
        { organization: 'AKC', registrationNumber: 'SW123', registeredName: 'Rex of MyK9' },
      ] as Dog['registrations'],
    });
    expect(matchesDogSearch(rex, 'sw12')).toBe(true);
    expect(matchesDogSearch(rex, 'OF MYK9')).toBe(true);
  });

  it('treats commas and parentheses as word breaks (MYK9-2148)', () => {
    const rex = dog({ ownerName: 'Mary Smith' });
    expect(matchesDogSearch(rex, 'Smith, Mary')).toBe(true);
    expect(matchesDogSearch(rex, 'smith,mary')).toBe(true);
    expect(matchesDogSearch(rex, '(Smith)')).toBe(true);
  });

  it('matches every dog for a blank query', () => {
    expect(matchesDogSearch(dog({}), '   ')).toBe(true);
  });
});
