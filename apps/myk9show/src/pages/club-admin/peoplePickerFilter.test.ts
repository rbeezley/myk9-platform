import { describe, expect, it } from 'vitest';
import {
  filterPeoplePicker,
  PEOPLE_PICKER_NO_MATCHES,
  PEOPLE_PICKER_PROMPT,
  PEOPLE_PICKER_RESULT_CAP,
} from './peoplePickerFilter';

const ada = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' };
const grace = { firstName: 'Grace', lastName: 'Hopper', email: 'grace@navy.mil' };
const noEmail = { firstName: 'Alan', lastName: 'Turing' };
const candidates = [ada, grace, noEmail];

describe('filterPeoplePicker', () => {
  it('lists nobody and prompts for a search when nothing is typed', () => {
    expect(filterPeoplePicker('', candidates)).toEqual({ people: [], hint: PEOPLE_PICKER_PROMPT });
    expect(PEOPLE_PICKER_PROMPT).toBe('Type a name or email to find someone.');
  });

  it('lists nobody after one character, even one that matches', () => {
    expect(filterPeoplePicker('a', candidates)).toEqual({
      people: [],
      hint: PEOPLE_PICKER_PROMPT,
    });
  });

  it('treats whitespace as nothing typed, including around one character', () => {
    expect(filterPeoplePicker('   ', candidates).people).toEqual([]);
    expect(filterPeoplePicker('  a  ', candidates)).toEqual({
      people: [],
      hint: PEOPLE_PICKER_PROMPT,
    });
  });

  it('matches by name or email from two characters, case-insensitively', () => {
    expect(filterPeoplePicker('AD', candidates)).toEqual({ people: [ada], hint: null });
    expect(filterPeoplePicker('navy', candidates)).toEqual({ people: [grace], hint: null });
    expect(filterPeoplePicker('alan turing', candidates)).toEqual({
      people: [noEmail],
      hint: null,
    });
  });

  it('says so when a search matches nobody', () => {
    expect(filterPeoplePicker('zz', candidates)).toEqual({
      people: [],
      hint: PEOPLE_PICKER_NO_MATCHES,
    });
  });

  it('keeps the candidate order the caller chose', () => {
    expect(filterPeoplePicker('ce', [grace, ada]).people).toEqual([grace, ada]);
  });

  it('caps the list and admits how many it is hiding', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      firstName: 'Pat',
      lastName: `Person${i}`,
      email: `pat${i}@example.com`,
    }));
    const result = filterPeoplePicker('pat', many);
    expect(result.people).toHaveLength(PEOPLE_PICKER_RESULT_CAP);
    expect(result.people[0]).toBe(many[0]);
    expect(result.hint).toBe('Showing the first 20 of 25. Keep typing to narrow the list.');
  });

  it('adds no line when exactly the cap matches', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ firstName: 'Pat', lastName: `P${i}` }));
    expect(filterPeoplePicker('pat', twenty)).toEqual({ people: twenty, hint: null });
  });
});
