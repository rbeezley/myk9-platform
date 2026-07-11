import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import { getDateFilteredShows, getShowStats } from './showFilters';

const show = (id: string, startDate: string): Show =>
  ({ id, startDate, status: 'Upcoming' }) as unknown as Show;

describe('showFilters date bucketing', () => {
  afterEach(() => vi.useRealTimers());

  it('classifies a first-of-month start date into the correct local month (not the prior month via UTC)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0)); // June 15 2026, local

    // "2026-06-01" parsed as UTC midnight is May 31 in US timezones — the bug this guards.
    const shows = [show('june-first', '2026-06-01')];
    expect(getDateFilteredShows(shows, 'this_month').map(s => s.id)).toEqual(['june-first']);
    expect(getShowStats(shows).thisMonth).toBe(1);
  });

  it('counts a future show as upcoming', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0));

    const shows = [show('later', '2026-06-20'), show('past', '2026-06-01')];
    expect(getDateFilteredShows(shows, 'upcoming').map(s => s.id)).toEqual(['later']);
    expect(getShowStats(shows).upcoming).toBe(1);
  });
});
