import { describe, it, expect, vi } from 'vitest';

vi.mock('@react-pdf/renderer', () => ({
  View: () => null,
  Text: () => null,
  Page: () => null,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
}));

// Import after mocks so @react-pdf side effects in the module graph are stubbed.
import { formatClosingTime } from '../PosterCover';

describe('formatClosingTime', () => {
  it('returns null for null input', () => {
    expect(formatClosingTime(null)).toBeNull();
  });

  it('returns null for an unparsable date string', () => {
    expect(formatClosingTime('not-a-date')).toBeNull();
  });

  it('returns a formatted time for a valid ISO datetime', () => {
    // 17:00 UTC → "5:00 PM" rendered in UTC.
    expect(formatClosingTime('2026-06-13T17:00:00Z')).toBe('5:00 PM');
  });

  it('returns null for a date-only string (no time component)', () => {
    // '2026-06-13' has no time — don't fabricate one.
    expect(formatClosingTime('2026-06-13')).toBeNull();
  });
});
