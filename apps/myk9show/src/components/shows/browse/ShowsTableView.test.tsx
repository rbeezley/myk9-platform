import { afterEach, describe, expect, it } from 'vitest';
import { formatShowsTableDateRange } from './ShowsTableView.helpers';

const originalTimezone = process.env.TZ;

afterEach(() => {
  if (originalTimezone) {
    process.env.TZ = originalTimezone;
  } else {
    delete process.env.TZ;
  }
});

describe('formatShowsTableDateRange', () => {
  it('formats date-only ranges without UTC day drift', () => {
    process.env.TZ = 'America/Chicago';

    expect(formatShowsTableDateRange('2026-08-01', '2026-08-03')).toBe('Aug 1–3, 2026');
  });
});
