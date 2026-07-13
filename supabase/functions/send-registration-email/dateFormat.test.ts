import { describe, expect, it } from 'vitest';

import { formatUsShowDateRange } from './dateFormat.ts';

describe('formatUsShowDateRange', () => {
  it('formats Supabase timestamps as a readable U.S. month-day-year range', () => {
    expect(formatUsShowDateRange('2026-08-01T00:00:00+00:00', '2026-08-03T00:00:00+00:00')).toBe(
      'August 1, 2026 — August 3, 2026'
    );
  });

  it('does not normalize an invalid calendar date into a different day', () => {
    expect(formatUsShowDateRange('2026-02-30', null)).toBe('');
  });
});
