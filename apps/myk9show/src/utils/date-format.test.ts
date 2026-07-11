import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toLocalDateOnly } from './date-format';

// Pin a fixed, west-of-UTC timezone so these assertions are deterministic on any
// CI runner. America/Chicago (CDT, UTC-5) matches toLocalDateOnly's own docstring
// example ("May 14 11:59 PM CDT" = "2026-05-15T04:59Z" → "2026-05-14").
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/Chicago';
});
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('toLocalDateOnly', () => {
  it('preserves the calendar date of a UTC-midnight timestamptz shape', () => {
    // A DATE column can round-trip as "2026-05-15T00:00:00+00:00". Local getters
    // in a west-of-UTC zone would misread this as the 14th and silently write the
    // wrong show date back on edit. The intended date is the one in the string.
    expect(toLocalDateOnly('2026-05-15T00:00:00+00:00')).toBe('2026-05-15');
    expect(toLocalDateOnly('2026-05-15T00:00:00Z')).toBe('2026-05-15');
  });

  it('maps a picker-local datetime to its local calendar date', () => {
    // "May 14 11:59 PM CDT" = "2026-05-15T04:59Z" must stay May 14 (existing behavior).
    expect(toLocalDateOnly('2026-05-15T04:59:00Z')).toBe('2026-05-14');
  });

  it('returns a bare YYYY-MM-DD string unchanged', () => {
    expect(toLocalDateOnly('2026-05-15')).toBe('2026-05-15');
  });

  it('returns falsy/empty input unchanged', () => {
    expect(toLocalDateOnly('')).toBe('');
  });
});
