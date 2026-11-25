import { describe, it, expect } from 'vitest';
import type { User } from '@/types/user-types';
import { matchPeopleByName, personDisplayName, PEOPLE_MATCH_LIMIT } from './matchPeopleByName';

const person = (id: string, firstName: string, lastName: string): User => ({
  id,
  firstName,
  lastName,
});

const directory = [
  person('1', 'Jo', 'Smith'),
  person('2', 'Maria', 'Gonzalez'),
  person('3', 'Joanna', 'Smithers'),
];

describe('matchPeopleByName', () => {
  it('matches every typed word in any order', () => {
    expect(matchPeopleByName(directory, 'smith jo').map(p => p.id)).toEqual(['1', '3']);
    expect(matchPeopleByName(directory, 'JO SMITH').map(p => p.id)).toEqual(['1', '3']);
  });

  it('finds the same owner for "Smith Mary", "Smith, Mary" and "(Smith)"', () => {
    const mary = person('7', 'Mary', 'Smith');
    for (const query of ['Smith Mary', 'Smith, Mary', '(Smith)']) {
      expect(matchPeopleByName([mary, directory[1]], query).map(p => p.id)).toEqual(['7']);
    }
  });

  it('returns nothing when the query is only separators', () => {
    expect(matchPeopleByName(directory, ',()')).toEqual([]);
  });

  it('returns nothing for a blank query or a name nobody has', () => {
    expect(matchPeopleByName(directory, '   ')).toEqual([]);
    expect(matchPeopleByName(directory, 'zzz')).toEqual([]);
  });

  it('falls back to the stored full name when first and last are empty', () => {
    const stored: User = { id: '9', firstName: '', lastName: '', name: 'Pat Lee' };
    expect(matchPeopleByName([stored], 'lee')).toEqual([stored]);
    expect(personDisplayName(stored)).toBe('Pat Lee');
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: PEOPLE_MATCH_LIMIT + 3 }, (_, i) =>
      person(String(i), 'Sam', `Lee${i}`)
    );
    expect(matchPeopleByName(many, 'sam')).toHaveLength(PEOPLE_MATCH_LIMIT);
  });
});
