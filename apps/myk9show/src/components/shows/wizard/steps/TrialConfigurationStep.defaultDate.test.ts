import { describe, expect, it } from 'vitest';
import { getDefaultTrialDateTime } from './TrialConfigurationStep.helpers';

describe('getDefaultTrialDateTime', () => {
  it('searches the whole show, not just its first 31 days', () => {
    const start = new Date(2026, 0, 1, 8).toISOString();
    const end = new Date(2026, 2, 31, 17).toISOString();
    // Two trials on each of the first 40 days.
    const existing = Array.from({ length: 80 }, (_, i) => {
      const day = new Date(2026, 0, 1 + Math.floor(i / 2), 8);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}T08:00:00`;
    });

    expect(getDefaultTrialDateTime(start, end, existing)).toBe('2026-02-10T08:00:00');
  });

  it('falls back to the last show day when every day is full', () => {
    const start = new Date(2026, 7, 14, 8).toISOString();
    const end = new Date(2026, 7, 15, 17).toISOString();
    const existing = [
      '2026-08-14T08:00:00',
      '2026-08-14T09:00:00',
      '2026-08-15T08:00:00',
      '2026-08-15T09:00:00',
    ];

    expect(getDefaultTrialDateTime(start, end, existing)).toBe('2026-08-15T08:00:00');
  });
});
