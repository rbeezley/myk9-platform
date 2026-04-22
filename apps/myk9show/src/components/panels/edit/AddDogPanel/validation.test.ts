import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Registration } from '@/types/dog-types';
import { addDogSchema, calculateAge, isTabValid } from './validation';
import { createInitialFormData } from './types';

const validRegistration = (overrides: Partial<Registration> = {}): Registration => ({
  id: 'reg-1',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'Fancy Formal Name',
  breed: 'Labrador Retriever',
  registrationNumber: 'AKC-12345',
  status: 'Active',
  ...overrides,
});

const validFormData = (overrides: Record<string, unknown> = {}) => ({
  ...createInitialFormData(),
  callName: 'Rex',
  gender: 'Male' as const,
  dateOfBirth: '2020-03-15',
  ownerId: 'person-1',
  ...overrides,
});

describe('calculateAge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22)); // April 22, 2026 local
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for empty input', () => {
    expect(calculateAge('')).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(calculateAge('not-a-date')).toBe('');
    expect(calculateAge('2024-13-01')).toBe('');
    expect(calculateAge('2024-02-30')).toBe('');
  });

  it('returns empty string for future dates', () => {
    expect(calculateAge('2030-01-01')).toBe('');
  });

  it('returns months-only when under a year old', () => {
    expect(calculateAge('2026-01-15')).toBe('3 months');
    expect(calculateAge('2026-03-22')).toBe('1 month'); // exactly 1 month
  });

  it('returns zero months for a dog born today', () => {
    expect(calculateAge('2026-04-22')).toBe('0 months');
  });

  it('returns "1 year" for exactly one year old', () => {
    expect(calculateAge('2025-04-22')).toBe('1 year');
  });

  it('handles day-of-month rollover correctly', () => {
    // Born on April 23, today is April 22 — just shy of full year
    expect(calculateAge('2025-04-23')).toBe('11 months');
    // Born on April 21, today is April 22 — one day past full year
    expect(calculateAge('2025-04-21')).toBe('1 year');
  });

  it('returns years and months for older dogs', () => {
    expect(calculateAge('2020-03-15')).toBe('6 years, 1 month');
    expect(calculateAge('2018-01-10')).toBe('8 years, 3 months');
  });

  it('singularizes year/month correctly', () => {
    expect(calculateAge('2025-03-22')).toBe('1 year, 1 month');
    expect(calculateAge('2024-03-22')).toBe('2 years, 1 month');
    expect(calculateAge('2025-02-22')).toBe('1 year, 2 months');
  });

  it('does not drift at UTC-midnight for negative-offset timezones', () => {
    // `new Date('2020-03-15')` would be UTC midnight, which in (e.g.) EST is
    // still March 14 local. parseLocalDate must treat the input as local.
    // Simulating by computing the age against the fixed system time.
    // If the implementation used new Date() directly, a user in UTC-5 on
    // March 15 local would see "just turned 6" shift to "5 years, 11 months".
    // Here we simply assert the stable local-parsed output.
    expect(calculateAge('2020-04-22')).toBe('6 years');
  });
});

describe('addDogSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 22));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts a fully valid form', () => {
    const result = addDogSchema.safeParse(validFormData());
    expect(result.success).toBe(true);
  });

  it('rejects empty call name', () => {
    const result = addDogSchema.safeParse(validFormData({ callName: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects call name longer than 120 chars', () => {
    const result = addDogSchema.safeParse(validFormData({ callName: 'a'.repeat(121) }));
    expect(result.success).toBe(false);
  });

  it('rejects future date of birth', () => {
    const result = addDogSchema.safeParse(validFormData({ dateOfBirth: '2030-01-01' }));
    expect(result.success).toBe(false);
  });

  it('rejects non-ISO date formats', () => {
    // Only YYYY-MM-DD is accepted (what `<input type="date">` emits).
    expect(addDogSchema.safeParse(validFormData({ dateOfBirth: 'March 15, 2020' })).success).toBe(
      false
    );
    expect(addDogSchema.safeParse(validFormData({ dateOfBirth: '03/15/2020' })).success).toBe(
      false
    );
    expect(addDogSchema.safeParse(validFormData({ dateOfBirth: '2020-3-15' })).success).toBe(false);
    expect(addDogSchema.safeParse(validFormData({ dateOfBirth: 'not-a-date' })).success).toBe(
      false
    );
  });

  it('rejects ISO dates with invalid day (Feb 30)', () => {
    const result = addDogSchema.safeParse(validFormData({ dateOfBirth: '2024-02-30' }));
    expect(result.success).toBe(false);
  });

  it('rejects missing gender', () => {
    const result = addDogSchema.safeParse(validFormData({ gender: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects missing ownerId', () => {
    const result = addDogSchema.safeParse(validFormData({ ownerId: '' }));
    expect(result.success).toBe(false);
  });

  it('rejects microchip that is too short', () => {
    const result = addDogSchema.safeParse(validFormData({ microchip: '12345' }));
    expect(result.success).toBe(false);
  });

  it('rejects microchip with non-alphanumeric chars', () => {
    const result = addDogSchema.safeParse(validFormData({ microchip: '123-45-678-9' }));
    expect(result.success).toBe(false);
  });

  it('accepts a valid 15-character microchip', () => {
    const result = addDogSchema.safeParse(validFormData({ microchip: '981020000123456' }));
    expect(result.success).toBe(true);
  });

  it('accepts an empty microchip (optional field)', () => {
    const result = addDogSchema.safeParse(validFormData({ microchip: '' }));
    expect(result.success).toBe(true);
  });

  it('rejects non-image imageUrl', () => {
    const result = addDogSchema.safeParse(validFormData({ imageUrl: 'javascript:alert(1)' }));
    expect(result.success).toBe(false);
  });

  it('rejects data:text/html imageUrl (XSS attempt)', () => {
    const result = addDogSchema.safeParse(
      validFormData({ imageUrl: 'data:text/html,<script>alert(1)</script>' })
    );
    expect(result.success).toBe(false);
  });

  it('accepts a valid https imageUrl', () => {
    const result = addDogSchema.safeParse(
      validFormData({ imageUrl: 'https://example.com/dog.jpg' })
    );
    expect(result.success).toBe(true);
  });

  it('accepts a valid data:image/ imageUrl', () => {
    const result = addDogSchema.safeParse(
      validFormData({ imageUrl: 'data:image/png;base64,iVBORw0KGgo=' })
    );
    expect(result.success).toBe(true);
  });

  describe('registrations array validation', () => {
    it('accepts an empty registrations array', () => {
      const result = addDogSchema.safeParse(validFormData({ registrations: [] }));
      expect(result.success).toBe(true);
    });

    it('accepts an array of valid registrations', () => {
      const result = addDogSchema.safeParse(
        validFormData({ registrations: [validRegistration()] })
      );
      expect(result.success).toBe(true);
    });

    it('rejects a non-array', () => {
      const result = addDogSchema.safeParse(validFormData({ registrations: 'not-an-array' }));
      expect(result.success).toBe(false);
    });

    it('rejects a registration missing required fields', () => {
      const result = addDogSchema.safeParse(
        validFormData({
          registrations: [validRegistration({ registeredName: '' })],
        })
      );
      expect(result.success).toBe(false);
    });

    it('rejects a registration with invalid status', () => {
      const result = addDogSchema.safeParse(
        validFormData({
          registrations: [validRegistration({ status: 'bogus-status' })],
        })
      );
      expect(result.success).toBe(false);
    });

    it('rejects a registration number with special characters', () => {
      const result = addDogSchema.safeParse(
        validFormData({
          registrations: [validRegistration({ registrationNumber: "'; DROP TABLE dogs;--" })],
        })
      );
      expect(result.success).toBe(false);
    });

    it('rejects a registration with an oversized field', () => {
      const result = addDogSchema.safeParse(
        validFormData({
          registrations: [validRegistration({ registeredName: 'x'.repeat(201) })],
        })
      );
      expect(result.success).toBe(false);
    });

    it('accepts slashes and hyphens in registration numbers', () => {
      const result = addDogSchema.safeParse(
        validFormData({
          registrations: [validRegistration({ registrationNumber: 'WS-12345/67' })],
        })
      );
      expect(result.success).toBe(true);
    });
  });
});

describe('isTabValid', () => {
  it('basic tab requires callName, gender, dateOfBirth, ownerId', () => {
    const data = {
      ...createInitialFormData(),
      callName: 'Rex',
      gender: 'Male' as const,
      dateOfBirth: '2020-01-01',
      ownerId: 'p-1',
    };
    expect(isTabValid('basic', data)).toBe(true);
  });

  it('basic tab rejects whitespace-only callName', () => {
    const data = {
      ...createInitialFormData(),
      callName: '   ',
      gender: 'Male' as const,
      dateOfBirth: '2020-01-01',
      ownerId: 'p-1',
    };
    expect(isTabValid('basic', data)).toBe(false);
  });

  it('registration tab is valid when no registrations added', () => {
    const data = createInitialFormData();
    expect(isTabValid('registration', data)).toBe(true);
  });

  it('registration tab is invalid when any registration is missing fields', () => {
    const data = {
      ...createInitialFormData(),
      registrations: [validRegistration({ breed: '' })],
    };
    expect(isTabValid('registration', data)).toBe(false);
  });

  it('optional tab is always valid', () => {
    expect(isTabValid('optional', createInitialFormData())).toBe(true);
  });
});
