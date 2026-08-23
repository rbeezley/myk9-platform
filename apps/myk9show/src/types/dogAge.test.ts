// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { formatDogAge } from './dog-types';

const NOW = new Date(2026, 7, 22); // 2026-08-22, local

describe('formatDogAge', () => {
  it('returns null when no date of birth is recorded', () => {
    expect(formatDogAge({}, NOW)).toBeNull();
    expect(formatDogAge({ dateOfBirth: '' }, NOW)).toBeNull();
    expect(formatDogAge({ dateOfBirth: '   ' }, NOW)).toBeNull();
    expect(formatDogAge({ dateOfBirth: 'not a date' }, NOW)).toBeNull();
  });

  it('accepts the alternative birthDate field', () => {
    expect(formatDogAge({ birthDate: '2020-08-22' }, NOW)).toBe('6 yrs old');
  });

  it('prefers dateOfBirth over birthDate when both are present', () => {
    expect(formatDogAge({ dateOfBirth: '2024-08-22', birthDate: '2010-01-01' }, NOW)).toBe(
      '2 yrs old'
    );
  });

  it('counts whole years and singularises one', () => {
    expect(formatDogAge({ dateOfBirth: '2025-08-22' }, NOW)).toBe('1 yr old');
    expect(formatDogAge({ dateOfBirth: '2023-08-22' }, NOW)).toBe('3 yrs old');
  });

  it('does not round a birthday up before it arrives', () => {
    // One day short of three years is still two.
    expect(formatDogAge({ dateOfBirth: '2023-08-23' }, NOW)).toBe('2 yrs old');
  });

  // The case a years-only formatter gets wrong: a puppy is not "0 yrs old".
  it('falls back to whole months under a year', () => {
    expect(formatDogAge({ dateOfBirth: '2026-01-22' }, NOW)).toBe('7 mos old');
    expect(formatDogAge({ dateOfBirth: '2026-07-22' }, NOW)).toBe('1 mo old');
  });

  it('says "under 1 mo" rather than zero for a newborn', () => {
    expect(formatDogAge({ dateOfBirth: '2026-08-15' }, NOW)).toBe('Under 1 mo old');
  });

  // A YYYY-MM-DD string parsed by `new Date()` is UTC midnight, which is the
  // previous local day west of Greenwich — enough to shift a birthday by one.
  it('reads a YYYY-MM-DD date as a local calendar date', () => {
    expect(formatDogAge({ dateOfBirth: '2025-08-22' }, new Date(2026, 7, 22, 0, 30))).toBe(
      '1 yr old'
    );
  });

  it('treats a future date of birth as unknown rather than as a newborn', () => {
    expect(formatDogAge({ dateOfBirth: '2027-01-01' }, NOW)).toBeNull();
  });
});
