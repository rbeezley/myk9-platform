import { afterEach, describe, it, expect } from 'vitest';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import {
  startOfLocalDay,
  isPastShowEntry,
  computeMyEntriesShowProgressStats,
  parseShowDate,
  getPartiallyScoredState,
  isScoredEntry,
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

  it('keeps the written calendar day of a timestamped DATE column', () => {
    // Callers only ever feed this calendar-date columns, so the day written in
    // the string is the intended one regardless of the offset it carries.
    const d = parseShowDate('2026-06-02T08:30:00-05:00')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(2);
  });

  it('returns undefined for empty input', () => {
    expect(parseShowDate(null)).toBeUndefined();
    expect(parseShowDate('')).toBeUndefined();
  });

  // MYK9-384 (E28): shows.entry_close_date round-trips as a midnight-UTC
  // timestamp. new Date() read 2027-01-02T00:00:00+00:00 as the evening of
  // Jan 1 in Chicago, so My Shows said "Entries close Jan 1, 2027" for a show
  // the server keeps open through the whole of Jan 2.
  describe('midnight-UTC DATE round-trip', () => {
    const originalTimezone = process.env.TZ;

    afterEach(() => {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    });

    // Negative offset (the reported repro), UTC, and two POSITIVE offsets.
    it.each(['America/Chicago', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati'])(
      'reads the entry-close date as Jan 2 across a month boundary in %s',
      timezone => {
        process.env.TZ = timezone;

        for (const raw of [
          '2027-01-02T00:00:00+00:00',
          '2027-01-02 00:00:00+00',
          '2027-01-02T00:00:00Z',
          '2027-01-02',
        ]) {
          const d = parseShowDate(raw)!;
          expect(d.getFullYear()).toBe(2027);
          expect(d.getMonth()).toBe(0);
          expect(d.getDate()).toBe(2);
        }
      }
    );
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

  // Real scored rows carry is_scored; the canonical accounting rules read that
  // rather than the lifecycle status.
  const scored = (id: string) =>
    makeClass(id, {
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      isScored: true,
      resultStatus: 'qualified',
    });

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
      classes: [
        scored('a'),
        makeClass('b', {
          status: 'scratched',
          entryStatus: EntryStatus.SCRATCHED,
          entryStatusKind: 'scratched',
        }),
      ],
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
          // No result: the reset cleared it, leaving only the stale status.
          resultStatus: undefined,
          entryStatus: EntryStatus.COMPLETED,
          entryStatusKind: 'completed',
        }),
      ],
    });

    expect(getPartiallyScoredState(entry)?.remainingClasses).toBe(1);
  });

  // `absent` / `excused` settle a run WITHOUT a score, so `is_scored` stays
  // false on a run that is nonetheless over. Reading is_scored alone would keep
  // promising the exhibitor a run that already came and went.
  it.each(['absent', 'excused'] as const)(
    'treats a %s result as settled even though it was never scored',
    resultStatus => {
      const entry = makeEntry({
        entryStatus: EntryStatus.COMPLETED,
        entryStatusKind: 'completed',
        classes: [scored('a'), makeClass('b', { isScored: false, resultStatus })],
      });

      expect(getPartiallyScoredState(entry)).toBeUndefined();
    }
  );

  // The source row of a move-up is superseded by the destination row that now
  // carries the run. The shared accounting predicate does not exclude it, so
  // without this the order advertises a class that no longer exists.
  it('ignores a moved source row once the real class is scored', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [
        scored('a'),
        makeClass('b', {
          status: 'moved',
          entryStatus: EntryStatus.MOVED,
          entryStatusKind: 'moved',
        }),
      ],
    });

    expect(getPartiallyScoredState(entry)).toBeUndefined();
    expect(isScoredEntry(entry)).toBe(true);
  });

  // An absent run is settled without ever being scored, so there is no score
  // for the order to be "partially" through.
  it('does not call an order partially scored when nothing was actually scored', () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.ACCEPTED,
      classes: [makeClass('a', { isScored: false, resultStatus: 'absent' }), makeClass('b')],
    });

    expect(getPartiallyScoredState(entry)).toBeUndefined();
  });

  // A reset row is outstanding, so its leftover 'completed' status must not
  // reach the summary — that would pair a completed icon with "still to run".
  it("does not carry a reset class's stale completed status into the summary", () => {
    const entry = makeEntry({
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
      classes: [
        scored('a'),
        makeClass('b', {
          isScored: false,
          resultStatus: undefined,
          entryStatus: EntryStatus.COMPLETED,
          entryStatusKind: 'completed',
        }),
      ],
    });

    const state = getPartiallyScoredState(entry);
    expect(state?.remainingClasses).toBe(1);
    expect(state?.entryStatus).not.toBe(EntryStatus.COMPLETED);
    expect(state?.entryStatusKind).not.toBe('completed');
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

describe('computeMyEntriesShowProgressStats — one verdict per show', () => {
  // A show holding both a finished order and an unfinished one must be counted
  // once. Classifying per entry put it in BOTH sets, so the two cards summed to
  // more shows than the exhibitor had entered.
  it('counts a show with one finished and one unfinished order as upcoming only', () => {
    const shared = { showId: 'mixed-show', showDate: new Date(2026, 5, 20) };
    const finished = makeEntry({
      ...shared,
      id: 'finished',
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
    });
    const unfinished = makeEntry({
      ...shared,
      id: 'unfinished',
      entryStatus: EntryStatus.ACCEPTED,
    });

    const stats = computeMyEntriesShowProgressStats([finished, unfinished], NOW);

    expect(stats.upcomingShows).toBe(1);
    expect(stats.completedShows).toBe(0);
    expect(stats.upcomingShows + stats.completedShows).toBe(1);
  });

  it('counts a show as completed only when every order on it is done', () => {
    const shared = { showId: 'done-show', showDate: new Date(2026, 5, 20) };
    const one = makeEntry({
      ...shared,
      id: 'one',
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
    });
    const two = makeEntry({
      ...shared,
      id: 'two',
      entryStatus: EntryStatus.COMPLETED,
      entryStatusKind: 'completed',
    });

    const stats = computeMyEntriesShowProgressStats([one, two], NOW);

    expect(stats.completedShows).toBe(1);
    expect(stats.upcomingShows).toBe(0);
  });
});
