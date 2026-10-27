import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication';
import { hasLocalEntryForShowToday } from './useLocalEntryForShowToday.helpers';

const SHOW = { id: 'show-1', startDate: '2026-10-22', endDate: '2026-10-24', deletedAt: null };

function entry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return { id: 'entry-1', showId: 'show-1', handlerId: 'person-1', ...overrides };
}

// Midday UTC: the New York (default) and UTC dates agree, so day-range cases
// below isolate the range rule from the timezone rule.
const NOW = new Date('2026-10-23T12:00:00Z');
const LA_SHOW = { id: 'show-1', startDate: '2026-11-07', endDate: '2026-11-08', deletedAt: null };
const LA_TRIALS = [{ id: 'trial-1', date: '2026-11-07', timezone: 'America/Los_Angeles' }];

const LIVE_TRIALS = [{ id: 'trial-1', date: '2026-10-23', timezone: 'America/New_York' }];

function run(overrides: Partial<Parameters<typeof hasLocalEntryForShowToday>[0]> = {}): boolean {
  return hasLocalEntryForShowToday({
    personId: 'person-1',
    showId: 'show-1',
    now: NOW,
    trials: [],
    show: SHOW,
    entries: [entry()],
    dogs: [],
    ...overrides,
  });
}

describe('hasLocalEntryForShowToday', () => {
  it('matches an entry the person handles', () => {
    expect(run()).toBe(true);
  });

  it('matches an entry for a dog the person owns', () => {
    expect(
      run({
        entries: [entry({ handlerId: 'someone-else', dogId: 'dog-1' })],
        dogs: [{ id: 'dog-1', ownerId: 'person-1' }],
      })
    ).toBe(true);
  });

  describe('co-owner (MYK9-1417)', () => {
    const coOwnedDogs = [{ id: 'dog-1', ownerId: 'primary-owner', coOwnerId: 'person-1' }];
    const coOwnedEntry = (overrides: Partial<ReplicatedEntry> = {}) =>
      entry({ handlerId: 'someone-else', dogId: 'dog-1', ...overrides });

    it('matches an entry for a dog the person co-owns, though they neither handle nor own it', () => {
      expect(run({ entries: [coOwnedEntry()], dogs: coOwnedDogs })).toBe(true);
    });

    it('still matches the primary owner of the same dog', () => {
      expect(run({ personId: 'primary-owner', entries: [coOwnedEntry()], dogs: coOwnedDogs })).toBe(
        true
      );
    });

    it('still matches the handler of the same dog', () => {
      expect(run({ personId: 'someone-else', entries: [coOwnedEntry()], dogs: coOwnedDogs })).toBe(
        true
      );
    });

    it('denies an unrelated person', () => {
      expect(run({ personId: 'stranger', entries: [coOwnedEntry()], dogs: coOwnedDogs })).toBe(
        false
      );
    });

    it('denies a withdrawn or scratched entry for the co-owned dog', () => {
      expect(
        run({ entries: [coOwnedEntry({ entryStatus: 'withdrawn' })], dogs: coOwnedDogs })
      ).toBe(false);
      expect(
        run({ entries: [coOwnedEntry({ entryStatus: 'scratched' })], dogs: coOwnedDogs })
      ).toBe(false);
    });

    it('admits nobody for a soft-deleted dog, as the RPC requires d.deleted_at is null', () => {
      const deletedDogs = [{ ...coOwnedDogs[0], deletedAt: '2026-10-01T00:00:00Z' }];
      expect(run({ entries: [coOwnedEntry()], dogs: deletedDogs })).toBe(false);
      expect(run({ personId: 'primary-owner', entries: [coOwnedEntry()], dogs: deletedDogs })).toBe(
        false
      );
      expect(run({ personId: 'someone-else', entries: [coOwnedEntry()], dogs: deletedDogs })).toBe(
        false
      );
    });
  });

  it('ignores an entry that is neither handled nor owned by the person', () => {
    expect(
      run({
        entries: [entry({ handlerId: 'someone-else', dogId: 'dog-1' })],
        dogs: [{ id: 'dog-1', ownerId: 'someone-else' }],
      })
    ).toBe(false);
  });

  it('excludes an entry for another show', () => {
    expect(run({ entries: [entry({ showId: 'show-2' })] })).toBe(false);
  });

  it('is false when the route show differs from the show row', () => {
    expect(run({ showId: 'show-2' })).toBe(false);
  });

  it('is false before the show starts', () => {
    expect(run({ now: new Date('2026-10-21T12:00:00Z') })).toBe(false);
  });

  it('is false after the show ends', () => {
    expect(run({ now: new Date('2026-10-25T12:00:00Z') })).toBe(false);
  });

  it('includes the start date', () => {
    expect(run({ now: new Date('2026-10-22T12:00:00Z') })).toBe(true);
  });

  it('includes the end date', () => {
    expect(run({ now: new Date('2026-10-24T12:00:00Z') })).toBe(true);
  });

  it('is false with no show row, no person, or no show id', () => {
    expect(run({ show: null })).toBe(false);
    expect(run({ personId: null })).toBe(false);
    expect(run({ showId: undefined })).toBe(false);
  });

  it('is false for a soft-deleted show', () => {
    expect(run({ show: { ...SHOW, deletedAt: '2026-10-01T00:00:00Z' } })).toBe(false);
  });

  it('mirrors the server RPC by skipping withdrawn, scratched and deleted entries', () => {
    expect(run({ entries: [entry({ entryStatus: 'withdrawn' })] })).toBe(false);
    expect(run({ entries: [entry({ entryStatus: 'scratched' })] })).toBe(false);
    expect(run({ entries: [entry({ deletedAt: '2026-10-01T00:00:00Z' })] })).toBe(false);
    expect(run({ entries: [entry({ entryStatus: 'confirmed' })] })).toBe(true);
  });

  describe('show-local today (MYK9-1354)', () => {
    const laRun = (
      iso: string,
      overrides: Partial<Parameters<typeof hasLocalEntryForShowToday>[0]> = {}
    ) => run({ now: new Date(iso), show: LA_SHOW, trials: LA_TRIALS, ...overrides });

    it('is false the evening before day 1 in the show zone, though the UTC date is already day 1', () => {
      // Nov 6 17:30 Pacific == Nov 7 01:30 UTC.
      expect(laRun('2026-11-07T01:30:00Z')).toBe(false);
    });

    it('is true on the morning of day 1', () => {
      expect(laRun('2026-11-07T16:00:00Z')).toBe(true);
    });

    it('is true the evening of the last day in the show zone, though the UTC date is already past it', () => {
      // Nov 8 18:00 Pacific == Nov 9 02:00 UTC.
      expect(laRun('2026-11-09T02:00:00Z')).toBe(true);
    });

    it('is false once the last day is over in the show zone', () => {
      expect(laRun('2026-11-09T08:30:00Z')).toBe(false);
    });

    it('picks the zone of the earliest trial, like the RPC', () => {
      const trials = [
        { id: 'b', date: '2026-11-08', timezone: 'America/New_York' },
        { id: 'a', date: '2026-11-07', timezone: 'America/Los_Angeles' },
      ];
      expect(laRun('2026-11-09T02:00:00Z', { trials })).toBe(true);
    });

    it('falls back to America/New_York for no trials or an unrecognized zone', () => {
      // Nov 8 21:00 New York == Nov 9 02:00 UTC: last day in NY, past it in UTC.
      expect(laRun('2026-11-09T02:00:00Z', { trials: [] })).toBe(true);
      expect(
        laRun('2026-11-09T02:00:00Z', {
          trials: [{ id: 't', date: '2026-11-07', timezone: 'Not/AZone' }],
        })
      ).toBe(true);
      // Nov 6 21:30 New York == Nov 7 02:30 UTC: still the evening before.
      expect(laRun('2026-11-07T02:30:00Z', { trials: [] })).toBe(false);
    });
  });

  describe('soft-deleted trial and class (MYK9-1441)', () => {
    it('drops an entry whose trial row is present and soft-deleted', () => {
      expect(
        run({
          entries: [entry({ trialId: 'trial-gone' })],
          trials: LIVE_TRIALS,
          deletedTrials: [{ id: 'trial-gone', deletedAt: '2026-10-20T00:00:00Z' }],
        })
      ).toBe(false);
    });

    it('keeps an entry whose trial the device does not hold', () => {
      expect(run({ entries: [entry({ trialId: 'trial-unknown' })], trials: [] })).toBe(true);
    });

    it('keeps an entry whose trial is live', () => {
      expect(run({ entries: [entry({ trialId: 'trial-1' })], trials: LIVE_TRIALS })).toBe(true);
    });

    it('drops an entry whose class is soft-deleted', () => {
      expect(
        run({
          entries: [entry({ classId: 'class-1' })],
          classes: [{ id: 'class-1', deletedAt: '2026-10-20T00:00:00Z' }],
        })
      ).toBe(false);
    });

    it('keeps an entry whose class is live or not held on the device', () => {
      expect(run({ entries: [entry({ classId: 'class-1' })], classes: [{ id: 'class-1' }] })).toBe(
        true
      );
      expect(run({ entries: [entry({ classId: 'class-2' })], classes: [] })).toBe(true);
    });

    it('still admits through another entry that is not in a deleted class', () => {
      expect(
        run({
          entries: [entry({ id: 'a', classId: 'class-1' }), entry({ id: 'b' })],
          classes: [{ id: 'class-1', deletedAt: '2026-10-20T00:00:00Z' }],
        })
      ).toBe(true);
    });
  });
});
