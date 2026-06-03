import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  startOfLocalDay,
  isPastShowEntry,
  computeMyEntriesShowDateStats,
  parseShowDate,
} from './myEntriesStats.helpers';
import type { MyEntry } from './my-entries-types';

const NOW = new Date(2026, 5, 2, 20, 0, 0); // Tue Jun 2 2026, 20:00 local

function makeEntry(overrides: Partial<MyEntry>): MyEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    showId: 'show-1',
    showName: 'Show 1',
    showDate: new Date(2026, 5, 2), // Jun 2
    location: { venue: '', city: '', state: '' },
    dogName: 'Dog',
    dogId: 'dog-1',
    classes: [],
    totalFee: 0,
    entryStatus: EntryStatus.PENDING,
    paymentStatus: PaymentStatus.PENDING,
    submittedAt: NOW,
    lastUpdated: NOW,
    ...overrides,
  };
}

describe('parseShowDate', () => {
  it('parses a date-only "YYYY-MM-DD" string as a LOCAL day (not UTC)', () => {
    // The bug: new Date("2026-06-02") is UTC midnight → previous local day in
    // negative-offset zones. parseShowDate must yield local Jun 2 at 00:00.
    const d = parseShowDate('2026-06-02')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
  });

  it('a show ending today (date-only) is NOT past — the exact root case', () => {
    const entry = makeEntry({ showDate: parseShowDate('2026-05-31'), showEndDate: parseShowDate('2026-06-02') });
    expect(isPastShowEntry(entry, NOW)).toBe(false);
  });

  it('a show that ended yesterday (date-only) IS past', () => {
    const entry = makeEntry({ showEndDate: parseShowDate('2026-06-01') });
    expect(isPastShowEntry(entry, NOW)).toBe(true);
  });

  it('passes through a full timestamp and returns undefined for empty', () => {
    expect(parseShowDate('2026-06-02T08:30:00-05:00')?.getFullYear()).toBe(2026);
    expect(parseShowDate(null)).toBeUndefined();
    expect(parseShowDate('')).toBeUndefined();
  });
});

describe('startOfLocalDay', () => {
  it('strips the time component', () => {
    const d = startOfLocalDay(new Date(2026, 5, 2, 20, 30, 15));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(2);
  });
});

describe('isPastShowEntry', () => {
  it('treats a single-day show happening today as NOT past', () => {
    const entry = makeEntry({ showDate: new Date(2026, 5, 2) }); // today, no end date
    expect(isPastShowEntry(entry, NOW)).toBe(false);
  });

  it('treats a multi-day show that started earlier but ends in the future as NOT past', () => {
    const entry = makeEntry({
      showDate: new Date(2026, 4, 31), // started May 31
      showEndDate: new Date(2026, 5, 14), // runs through Jun 14
    });
    expect(isPastShowEntry(entry, NOW)).toBe(false);
  });

  it('treats a show whose final day is before today as past', () => {
    const entry = makeEntry({
      showDate: new Date(2026, 4, 14),
      showEndDate: new Date(2026, 4, 16), // ended May 16
    });
    expect(isPastShowEntry(entry, NOW)).toBe(true);
  });

  it('falls back to start date when no end date is present', () => {
    const past = makeEntry({ showDate: new Date(2026, 4, 21), showEndDate: undefined });
    expect(isPastShowEntry(past, NOW)).toBe(true);
  });

  it('does not count a show that ends today as past (boundary)', () => {
    const entry = makeEntry({ showEndDate: new Date(2026, 5, 2, 8, 0) }); // ends today 8am
    expect(isPastShowEntry(entry, NOW)).toBe(false);
  });
});

describe('computeMyEntriesShowDateStats', () => {
  // Mirrors the real staging fixture for exhibitor1:
  //  - Heritage: started May 31, still running today  -> 1 upcoming show, 1 entry
  //  - QA Walk 1593 (May 21): past                    -> contributes to past shows
  //  - QA Walk 0779 (May 14): past, 3 entries         -> contributes to past shows
  const entries: MyEntry[] = [
    makeEntry({
      id: 'e-heritage',
      showId: 'heritage',
      showName: 'Heritage',
      showDate: new Date(2026, 4, 31),
      showEndDate: new Date(2026, 5, 14),
    }),
    makeEntry({ id: 'e-1593a', showId: 'qa1593', showDate: new Date(2026, 4, 21) }),
    makeEntry({ id: 'e-1593b', showId: 'qa1593', showDate: new Date(2026, 4, 21) }),
    makeEntry({ id: 'e-0779a', showId: 'qa0779', showDate: new Date(2026, 4, 14) }),
    makeEntry({ id: 'e-0779b', showId: 'qa0779', showDate: new Date(2026, 4, 14) }),
    makeEntry({ id: 'e-0779c', showId: 'qa0779', showDate: new Date(2026, 4, 14) }),
  ];

  it('counts DISTINCT shows, not entries', () => {
    const stats = computeMyEntriesShowDateStats(entries, NOW);
    expect(stats.pastShows).toBe(2); // qa1593 + qa0779, not 5 entries
    expect(stats.upcomingShows).toBe(1); // heritage (running today)
  });

  it('counts upcoming entries (entries in non-past shows)', () => {
    const stats = computeMyEntriesShowDateStats(entries, NOW);
    expect(stats.upcomingEntries).toBe(1); // only the single Heritage entry
  });

  it('returns zeroed stats for no entries', () => {
    expect(computeMyEntriesShowDateStats([], NOW)).toEqual({
      pastShows: 0,
      upcomingShows: 0,
      upcomingEntries: 0,
    });
  });
});
