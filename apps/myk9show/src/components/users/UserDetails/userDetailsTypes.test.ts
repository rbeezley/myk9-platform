import { describe, it, expect } from 'vitest';
import { extractPersonName } from './userDetailsTypes';
import type { User as UserType } from '@/types/user-types';

function person(overrides: Partial<UserType> = {}): UserType {
  return { id: 'p1', ...overrides } as UserType;
}

describe('extractPersonName', () => {
  it('joins both name parts when both are present', () => {
    const { firstName, lastName, fullName } = extractPersonName(
      person({ firstName: 'Richard', lastName: 'Beezley' })
    );
    expect(firstName).toBe('Richard');
    expect(lastName).toBe('Beezley');
    expect(fullName).toBe('Richard Beezley');
  });

  // The name rows were removed from the Contact Information card because the
  // hero heading IS this value — so any record whose real name did not reach
  // `fullName` would have lost its name from the page entirely.
  it('uses the first name alone when there is no surname', () => {
    expect(extractPersonName(person({ firstName: 'Nancy', email: 'n@example.com' })).fullName).toBe(
      'Nancy'
    );
  });

  it('uses the surname alone when there is no first name', () => {
    expect(
      extractPersonName(person({ lastName: 'Whitaker', email: 'w@example.com' })).fullName
    ).toBe('Whitaker');
  });

  it('falls back to the email only when no name part exists at all', () => {
    expect(extractPersonName(person({ email: 'someone@example.com' })).fullName).toBe(
      'someone@example.com'
    );
  });

  it('falls back to Unknown User when there is neither a name nor an email', () => {
    expect(extractPersonName(person()).fullName).toBe('Unknown User');
  });

  it('reads the snake_case columns the API returns', () => {
    const raw = { id: 'p1', first_name: 'Margaret', last_name: 'Holloway' } as unknown as UserType;
    expect(extractPersonName(raw).fullName).toBe('Margaret Holloway');
  });
});
