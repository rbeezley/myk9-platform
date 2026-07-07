import { describe, expect, it } from 'vitest';
import type { User } from '@/types/user-types';
import {
  findLikelyDuplicatePersonCandidate,
  normalizePersonEmail,
  normalizePersonName,
  normalizePhone,
  personEmailsMatch,
} from './personIdentity';

const person = (overrides: Partial<User> = {}): User => ({
  id: 'person-1',
  firstName: 'Tera',
  lastName: 'Handler',
  email: 'tera@example.com',
  phone: '(555) 123-4567',
  streetAddress: '10 Trial Lane',
  city: 'Tulsa',
  state: 'OK',
  zipCode: '74101',
  dogs: [],
  ...overrides,
});

describe('person identity normalization', () => {
  it('normalizes email, names, and phone numbers', () => {
    expect(normalizePersonEmail(' TERA@Example.COM ')).toBe('tera@example.com');
    expect(normalizePersonName(' Tera-Marie  Handler ')).toBe('TERA MARIE HANDLER');
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567');
    expect(personEmailsMatch('TERA@example.com', 'tera@EXAMPLE.com')).toBe(true);
  });
});

describe('person identity candidates', () => {
  it('suggests an exact email match', () => {
    const candidate = findLikelyDuplicatePersonCandidate([person()], {
      firstName: 'Other',
      lastName: 'Name',
      email: 'TERA@example.com',
    });

    expect(candidate?.person.id).toBe('person-1');
    expect(candidate?.reasons).toContain('same email');
  });

  it('suggests a name plus phone match', () => {
    const candidate = findLikelyDuplicatePersonCandidate([person()], {
      firstName: 'Tera',
      lastName: 'Handler',
      phone: '5551234567',
    });

    expect(candidate?.person.id).toBe('person-1');
    expect(candidate?.reasons).toContain('same name');
    expect(candidate?.reasons).toContain('same phone');
  });

  it('does not suggest matching name alone', () => {
    expect(
      findLikelyDuplicatePersonCandidate([person()], {
        firstName: 'Tera',
        lastName: 'Handler',
      })
    ).toBeNull();
  });
});
