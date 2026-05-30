import { describe, expect, it } from 'vitest';
import { parseTimeLimit } from './combinedEntryListHelpers';

describe('parseTimeLimit', () => {
  it('parses the "<seconds>s" wire format used by single-class and combined paths', () => {
    expect(parseTimeLimit('180s')).toBe(180);
    expect(parseTimeLimit('300s')).toBe(300);
    expect(parseTimeLimit('45s')).toBe(45);
  });

  it('returns undefined for missing or empty input', () => {
    expect(parseTimeLimit(undefined)).toBeUndefined();
    expect(parseTimeLimit('')).toBeUndefined();
  });

  it('returns undefined for non-numeric input', () => {
    expect(parseTimeLimit('abc')).toBeUndefined();
  });

  // Regression: combined-class Supabase path was passing M:SS strings (e.g. "3:00")
  // which parseInt truncates to the minute component (3) instead of 180.
  // The producer fix normalises to "<seconds>s" so this case should never reach
  // parseTimeLimit in production, but we document the footgun here.
  it('truncates M:SS strings — documents the footgun that motivated the producer fix', () => {
    expect(parseTimeLimit('3:00')).toBe(3); // NOT 180
  });
});
