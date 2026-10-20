import { describe, expect, it } from 'vitest';
import { showFactory } from '@/test/utils/factories';
import type { Show } from '@/types/show-types';
import { groupShowsForPane, showsPaneGroupFor } from './showsPaneGroups';

const makeShow = (overrides: Partial<Show> = {}) =>
  showFactory.build({ status: 'published', ...overrides });

const groupIds = (shows: Show[], now: Date, isManaged: (show: Show) => boolean = () => false) =>
  groupShowsForPane(shows, isManaged, now).map(group => ({
    id: group.id,
    shows: group.shows.map(show => show.id),
  }));

describe('showsPaneGroupFor', () => {
  // A Pacific show running Oct 15-16. 2026-10-16T00:30Z is Oct 15, 5:30pm in Los Angeles:
  // just past midnight UTC, the show is still on its FIRST day, not its second.
  const pacificTwoDay = makeShow({
    startDate: '2026-10-15',
    endDate: '2026-10-16',
    entryWindowTimeZone: 'America/Los_Angeles',
  });

  it.each([
    ['the evening before day one', '2026-10-15T06:30:00Z', 'upcoming'],
    ['day one, morning', '2026-10-15T15:00:00Z', 'today'],
    ['day one, just after midnight UTC', '2026-10-16T00:30:00Z', 'today'],
    ['day two, just after midnight UTC', '2026-10-17T00:30:00Z', 'today'],
    ['day two, late evening', '2026-10-17T06:59:00Z', 'today'],
    ['the morning after the last day', '2026-10-17T07:30:00Z', 'past'],
  ] as const)('a multi-day Pacific show is %s → %s', (_label, instant, expected) => {
    expect(showsPaneGroupFor(pacificTwoDay, new Date(instant))).toBe(expected);
  });

  it('judges the day in the show zone, not the viewer zone', () => {
    // 2026-10-16T05:00Z: Oct 15 (10pm) in Los Angeles, already Oct 16 in New York and Berlin.
    const instant = new Date('2026-10-16T05:00:00Z');
    const pacificOneDay = makeShow({
      startDate: '2026-10-15',
      endDate: '2026-10-15',
      entryWindowTimeZone: 'America/Los_Angeles',
    });
    const easternOneDay = { ...pacificOneDay, entryWindowTimeZone: 'America/New_York' };
    const berlinOneDay = { ...pacificOneDay, entryWindowTimeZone: 'Europe/Berlin' };

    expect(showsPaneGroupFor(pacificOneDay, instant)).toBe('today');
    expect(showsPaneGroupFor(easternOneDay, instant)).toBe('past');
    expect(showsPaneGroupFor(berlinOneDay, instant)).toBe('past');
  });

  it('falls back to the default show zone (Eastern) when no trial zone is stamped', () => {
    const show = makeShow({ startDate: '2026-10-15', endDate: '2026-10-15' });
    delete show.entryWindowTimeZone;
    // 2026-10-16T03:30Z is still Oct 15 in New York.
    expect(showsPaneGroupFor(show, new Date('2026-10-16T03:30:00Z'))).toBe('today');
    expect(showsPaneGroupFor(show, new Date('2026-10-16T04:30:00Z'))).toBe('past');
  });

  it('treats a missing end date as a one-day show', () => {
    const show = makeShow({ startDate: '2026-10-15', endDate: '' });
    expect(showsPaneGroupFor(show, new Date('2026-10-15T16:00:00Z'))).toBe('today');
    expect(showsPaneGroupFor(show, new Date('2026-10-16T16:00:00Z'))).toBe('past');
  });

  it('reads a DATE column that round-trips as UTC midnight as its own calendar day', () => {
    const show = makeShow({
      startDate: '2026-10-15T00:00:00+00:00',
      endDate: '2026-10-15T00:00:00+00:00',
      entryWindowTimeZone: 'America/Chicago',
    });
    expect(showsPaneGroupFor(show, new Date('2026-10-15T18:00:00Z'))).toBe('today');
  });

  it.each(['completed', 'cancelled'])(
    'puts a %s show in Past even while its dates cover today',
    status => {
      const show = makeShow({ status, startDate: '2026-10-15', endDate: '2026-10-17' });
      expect(showsPaneGroupFor(show, new Date('2026-10-16T16:00:00Z'))).toBe('past');
    }
  );

  it('places a draft by its dates like any other show', () => {
    const now = new Date('2026-10-15T16:00:00Z');
    const draft = (startDate: string) =>
      makeShow({ status: 'draft', startDate, endDate: startDate });
    expect(showsPaneGroupFor(draft('2026-11-01'), now)).toBe('upcoming');
    expect(showsPaneGroupFor(draft('2026-10-15'), now)).toBe('today');
  });

  it('keeps a show with no start date in Upcoming rather than dropping it', () => {
    expect(showsPaneGroupFor(makeShow({ startDate: '' }), new Date())).toBe('upcoming');
  });
});

describe('groupShowsForPane', () => {
  const now = new Date('2026-10-15T16:00:00Z');

  it('orders groups Today, Upcoming, Past and leaves empty groups out', () => {
    const shows = [
      makeShow({ id: 'past', startDate: '2026-09-01', endDate: '2026-09-02' }),
      makeShow({ id: 'next', startDate: '2026-11-01', endDate: '2026-11-01' }),
    ];
    expect(groupShowsForPane(shows, () => false, now).map(g => g.label)).toEqual([
      'Upcoming',
      'Past',
    ]);
  });

  it('sorts Upcoming soonest first and Past most recent first', () => {
    const shows = [
      makeShow({ id: 'dec', startDate: '2026-12-01', endDate: '2026-12-01', name: 'A' }),
      makeShow({ id: 'nov', startDate: '2026-11-01', endDate: '2026-11-01', name: 'B' }),
      makeShow({ id: 'jan', startDate: '2026-01-10', endDate: '2026-01-10', name: 'C' }),
      makeShow({ id: 'sep', startDate: '2026-09-10', endDate: '2026-09-10', name: 'D' }),
    ];
    expect(groupIds(shows, now)).toEqual([
      { id: 'upcoming', shows: ['nov', 'dec'] },
      { id: 'past', shows: ['sep', 'jan'] },
    ]);
  });

  describe('Managing section', () => {
    const managed = new Set(['mine-today', 'mine-later', 'mine-soon', 'mine-old', 'mine-done']);
    const isMine = (show: Show) => managed.has(show.id);
    const shows = [
      makeShow({ id: 'other-today', startDate: '2026-10-14', endDate: '2026-10-16', name: 'A' }),
      makeShow({ id: 'mine-today', startDate: '2026-10-15', endDate: '2026-10-15', name: 'B' }),
      makeShow({ id: 'other-soon', startDate: '2026-10-20', endDate: '2026-10-20', name: 'C' }),
      makeShow({ id: 'mine-later', startDate: '2026-12-20', endDate: '2026-12-20', name: 'D' }),
      makeShow({ id: 'mine-soon', startDate: '2026-11-05', endDate: '2026-11-05', name: 'G' }),
      makeShow({ id: 'other-recent', startDate: '2026-10-01', endDate: '2026-10-01', name: 'E' }),
      makeShow({ id: 'mine-old', startDate: '2026-01-01', endDate: '2026-01-01', name: 'F' }),
      makeShow({
        id: 'mine-done',
        status: 'completed',
        startDate: '2026-10-15',
        endDate: '2026-10-16',
        name: 'H',
      }),
    ];

    it('lists managed current shows once, today first then soonest, and keeps the rest below', () => {
      expect(groupIds(shows, now, isMine)).toEqual([
        { id: 'managing', shows: ['mine-today', 'mine-soon', 'mine-later'] },
        { id: 'today', shows: ['other-today'] },
        { id: 'upcoming', shows: ['other-soon'] },
        { id: 'past', shows: ['mine-done', 'mine-old', 'other-recent'] },
      ]);
      const all = groupShowsForPane(shows, isMine, now).flatMap(g => g.shows.map(s => s.id));
      expect(new Set(all).size).toBe(shows.length);
    });

    it('exposes the first managed show as the first item of the first group', () => {
      const [first] = groupShowsForPane(shows, isMine, now);
      expect(first.id).toBe('managing');
      expect(first.shows[0].id).toBe('mine-today');
    });

    it('sends a managed today show to Managing and a managed past show to Past', () => {
      const two = [shows[1], shows[6]];
      expect(groupIds(two, now, isMine)).toEqual([
        { id: 'managing', shows: ['mine-today'] },
        { id: 'past', shows: ['mine-old'] },
      ]);
    });

    it('omits Managing for a viewer who manages nothing, such as a site admin', () => {
      const ids = groupShowsForPane(shows, () => false, now).map(g => g.id);
      expect(ids).toEqual(['today', 'upcoming', 'past']);
    });

    it('omits Managing when every managed show is over', () => {
      expect(groupIds([shows[6], shows[7]], now, isMine)).toEqual([
        { id: 'past', shows: ['mine-done', 'mine-old'] },
      ]);
    });

    it('lists a managed draft as current in Managing', () => {
      const draft = makeShow({ id: 'mine-later', status: 'draft', startDate: '2026-12-20' });
      expect(groupIds([draft], now, isMine)).toEqual([{ id: 'managing', shows: ['mine-later'] }]);
    });
  });

  it('returns no groups for no shows', () => {
    expect(groupShowsForPane([], () => false, now)).toEqual([]);
  });
});
