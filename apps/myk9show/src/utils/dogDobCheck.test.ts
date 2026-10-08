import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUnderMinAgeDobWarning, isFutureDob } from './dogDobCheck';

describe('dogDobCheck (MYK9-1060)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 8, 12, 0, 0)); // Oct 8, 2026 local
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isFutureDob', () => {
    it('is true for a birthday after today, false for today and the past', () => {
      expect(isFutureDob('2026-10-09')).toBe(true);
      expect(isFutureDob('2026-10-08')).toBe(false);
      expect(isFutureDob('2020-01-01')).toBe(false);
    });
    it('is false for unparseable input (other validators own that message)', () => {
      expect(isFutureDob('')).toBe(false);
      expect(isFutureDob('nope')).toBe(false);
    });
  });

  describe('getUnderMinAgeDobWarning', () => {
    it('warns, naming the dog and the show date, when the dog is under 6 months on that date', () => {
      expect(getUnderMinAgeDobWarning('2026-10-08', 'Cracker', '2026-10-24')).toBe(
        "Cracker would be under 6 months on Oct 24, 2026 and can't be entered. Check the date of birth."
      );
    });
    it('uses today when no show date is known', () => {
      expect(getUnderMinAgeDobWarning('2026-10-08', 'Liddle')).toBe(
        "Liddle would be under 6 months on Oct 8, 2026 and can't be entered. Check the date of birth."
      );
    });
    it('judges age on the show date, not today (a pup old enough by the show is fine)', () => {
      expect(getUnderMinAgeDobWarning('2026-06-01', 'Pup')).not.toBeNull();
      expect(getUnderMinAgeDobWarning('2026-06-01', 'Pup', '2026-12-15')).toBeNull();
    });
    it('is silent for an adult, an empty value, or a future date (that one is an error)', () => {
      expect(getUnderMinAgeDobWarning('2020-01-01', 'Max')).toBeNull();
      expect(getUnderMinAgeDobWarning('', 'Max')).toBeNull();
      expect(getUnderMinAgeDobWarning('2027-01-01', 'Max')).toBeNull();
    });
    it('falls back to "This dog" without a call name', () => {
      expect(getUnderMinAgeDobWarning('2026-10-08', '  ')).toMatch(/^This dog would be under/);
    });
  });
});
