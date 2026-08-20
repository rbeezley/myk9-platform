import { describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  startOfLocalDay,
  isPastShowEntry,
  computeMyEntriesShowProgressStats,
  parseShowDate,
  getPartiallyScoredState,
} from './myEntriesStats.helpers';
import type { EntryClass, MyEntry } from './my-entries-types';

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
    dogs: [],
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
    const entry = makeEntry({
      showDate: parseShowDate('2026-05-31'),
      showEndDate: parseShowDate('2026-06-02'),
    });
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

describe('computeMyEntriesShowProgressStats', () => {
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
    const stats = computeMyEntriesShowProgressStats(entries, NOW);
    expect(stats.completedShows).toBe(2); // qa1593 + qa0779, not 5 entries
    expect(stats.upcomingShows).toBe(1); // heritage (running today)
  });

  it('counts upcoming entries (entries in non-past shows)', () => {
    const stats = computeMyEntriesShowProgressStats(entries, NOW);
    expect(stats.upcomingEntries).toBe(1); // only the single Heritage entry
  });

  it('returns zeroed stats for no entries', () => {
    expect(computeMyEntriesShowProgressStats([], NOW)).toEqual({
      completedShows: 0,
      upcomingShows: 0,
      upcomingEntries: 0,
    });
  });
});

describe('getPartiallyScoredState', () => {
  function makeClass(id: string, overrides: Partial<EntryClass> = {}): EntryClass {
    return {
      id,
      name: `Class ${id}`,
      number: id,
      fee: 0,
      status: 'entered',
      entryStatus: EntryStatus.ACCEPTED,
      entryStatusKind: 'accepted',
      ...overrides,
    };
  }

  const scored = (id: string) =>
    makeClass(id, { entryStatus: EntryStatus.COMPLETED, entryStatusKind: 'completed' });

  it('reports the classes still to run on a part-scored order', () => {
    // The order card itself reads `completed` (COMPLETED tops the grouping's
    // priority scale) — the point of this helper is to see past that.
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [scored('a'), makeClass('b'), makeClass('c')],
    });

    expect(getPartiallyScoredState(entry)).toEqual({
      remainingClasses: 2,
      entryStatus: EntryStatus.ACCEPTED,
      entryStatusKind: 'accepted',
    });
  });

  it('resolves the remaining status by the same precedence the card uses', () => {
    // A dog already in the ring outranks a plain accepted sibling, so the card
    // never tells the exhibitor "accepted" about a dog currently running.
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [
        scored('a'),
        makeClass('b'),
        makeClass('c', { entryStatus: EntryStatus.ACCEPTED, entryStatusKind: 'in_ring' }),
      ],
    });

    expect(getPartiallyScoredState(entry)?.entryStatusKind).toBe('in_ring');
  });

  it('returns undefined for an untouched order', () => {
    const entry = makeEntry({ classes: [makeClass('a'), makeClass('b')] });
    expect(getPartiallyScoredState(entry)).toBeUndefined();
  });

  it('returns undefined once every class is scored', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [scored('a'), scored('b')],
    });
    expect(getPartiallyScoredState(entry)).toBeUndefined();
  });

  it('ignores classes the exhibitor will not run', () => {
    // One scored, one scratched — nothing is left to run, so this is finished,
    // not partial.
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [scored('a'), makeClass('b', { status: 'scratched' })],
    });
    expect(getPartiallyScoredState(entry)).toBeUndefined();
  });

  // Every score-reset path clears `is_scored` but leaves `check_in_status` on
  // 'completed'. Reading the status alone would keep the reset run filed as
  // done, with no way back out of the Completed tab.
  it('treats an explicitly reset class as unscored despite a stale completed status', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [
        scored('a'),
        // Reset: is_scored cleared, status left behind.
        makeClass('b', {
          isScored: false,
          entryStatus: EntryStatus.COMPLETED,
          entryStatusKind: 'completed',
        }),
      ],
    });

    expect(getPartiallyScoredState(entry)?.remainingClasses).toBe(1);
  });

  it('returns undefined for a legacy order with no class rows', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [],
    });
    expect(getPartiallyScoredState(entry)).toBeUndefined();
  });
});
