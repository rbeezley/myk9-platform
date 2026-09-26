import { describe, expect, it } from 'vitest';
import {
  deriveDogActivity,
  formatActivityDate,
  getEntryDisplayDate,
  type DogActivityEntry,
} from '../dogActivity';

const TODAY = new Date(2026, 6, 2);

function entry(overrides: Partial<DogActivityEntry> = {}): DogActivityEntry {
  return {
    id: 'entry-1',
    entry_status: 'submitted',
    result_status: null,
    is_scored: false,
    search_time_seconds: null,
    final_placement: null,
    show: {
      id: 'show-1',
      name: 'Heartland Scent Work Classic',
      start_date: '2026-08-01',
    },
    class: {
      id: 'class-1',
      name: 'Exterior Novice A',
    },
    ...overrides,
  };
}

describe('deriveDogActivity', () => {
  it('keeps a submitted future entry under upcoming and out of recent results', () => {
    const activity = deriveDogActivity([entry()], TODAY);

    expect(activity.upcoming.map(e => e.id)).toEqual(['entry-1']);
    expect(activity.recentResults).toEqual([]);
  });

  it('does not treat unscored rows with default result fields as recent results', () => {
    const activity = deriveDogActivity(
      [
        entry({
          id: 'unscored-past',
          result_status: 'nq',
          search_time_seconds: 0,
          show: { id: 'show-1', name: 'Past show', start_date: '2026-06-01' },
        }),
      ],
      TODAY
    );

    expect(activity.recentResults).toEqual([]);
  });

  it('excludes future scored-looking rows from recent results', () => {
    const activity = deriveDogActivity(
      [
        entry({
          id: 'future-score',
          is_scored: true,
          result_status: 'qualified',
          search_time_seconds: 38.42,
        }),
      ],
      TODAY
    );

    expect(activity.recentResults).toEqual([]);
  });

  it('returns a real past score as a recent result', () => {
    const activity = deriveDogActivity(
      [
        entry({
          id: 'real-score',
          entry_status: 'completed',
          is_scored: true,
          result_status: 'qualified',
          search_time_seconds: 42.15,
          show: { id: 'show-1', name: 'Past show', start_date: '2026-06-01' },
        }),
      ],
      TODAY
    );

    expect(activity.recentResults.map(e => e.id)).toEqual(['real-score']);
    expect(activity.upcoming).toEqual([]);
  });

  it('does not show withdrawn future entries as upcoming or recent', () => {
    const activity = deriveDogActivity(
      [
        entry({
          id: 'withdrawn-future',
          entry_status: 'withdrawn',
        }),
      ],
      TODAY
    );

    expect(activity.upcoming).toEqual([]);
    expect(activity.recentResults).toEqual([]);
  });

  it('keeps a promotion-expired entry out of Upcoming', () => {
    const activity = deriveDogActivity([entry({ entry_status: 'promotion-expired' })], TODAY);

    expect(activity.upcoming).toEqual([]);
  });

  it('cannot close an unscored run from a completed check-in when the result is hidden', () => {
    // An unreleased excused outcome and a score-reset run can expose the same
    // safe fields. Treat both as outstanding until a safe projection exists.
    const activity = deriveDogActivity(
      [entry({ check_in_status: 'completed', is_scored: false, result_status: null })],
      TODAY
    );

    expect(activity.upcoming.map(row => row.id)).toEqual(['entry-1']);
  });
});

describe('formatActivityDate', () => {
  it('formats date-only show dates as local calendar dates', () => {
    expect(formatActivityDate('2026-08-01')).toEqual({
      weekday: 'Sat',
      monthDay: 'Aug 1',
    });
  });
});

describe('per-trial dates on a multi-day show (MYK9-806)', () => {
  // 'Heartland Scent Work Week' shape: one show, one trial per day — every
  // entry shares the same show.start_date, so a display date or an
  // upcoming/past classification derived from the SHOW is wrong for every
  // trial after the first.
  const SHOW = { id: 'show-week', name: 'Scent Work Week', start_date: '2026-09-25' };

  it('getEntryDisplayDate prefers the entry’s own trial date over the show start date', () => {
    const withTrial = entry({
      show: SHOW,
      trial: { date: '2026-09-28', timezone: 'America/Chicago' },
    });
    expect(getEntryDisplayDate(withTrial)).toBe('2026-09-28');
  });

  it('getEntryDisplayDate falls back to the show start date when no trial join is present', () => {
    expect(getEntryDisplayDate(entry({ show: SHOW, trial: undefined }))).toBe('2026-09-25');
  });

  it('does not treat a past, unrun trial from a still-running show as upcoming', () => {
    // Day 3 of the week (Sep 27) — day 1's trial has already passed.
    const day3 = new Date(2026, 8, 27);
    const activity = deriveDogActivity(
      [
        entry({
          id: 'day-1-unrun',
          show: SHOW,
          trial: { date: '2026-09-25', timezone: 'America/Chicago' },
        }),
      ],
      day3
    );

    expect(activity.upcoming).toEqual([]);
  });

  it('keeps today’s and future trials from the same multi-day show as upcoming', () => {
    const day3 = new Date(2026, 8, 27);
    const activity = deriveDogActivity(
      [
        entry({
          id: 'day-3-today',
          show: SHOW,
          trial: { date: '2026-09-27', timezone: 'America/Chicago' },
        }),
        entry({
          id: 'day-5-future',
          show: SHOW,
          trial: { date: '2026-09-29', timezone: 'America/Chicago' },
        }),
      ],
      day3
    );

    expect(activity.upcoming.map(e => e.id)).toEqual(
      expect.arrayContaining(['day-3-today', 'day-5-future'])
    );
    expect(activity.upcoming).toHaveLength(2);
  });

  it('reckons the trial day in the TRIAL zone, not the UTC day, right at the UTC/Chicago midnight gap', () => {
    // 02:00 UTC on Sep 27 is 21:00 CDT on Sep 26 — UTC has already rolled to
    // the 27th, but Chicago has not, so the Sep-26 trial is still "today",
    // not yet past.
    const justAfterUtcMidnight = new Date('2026-09-27T02:00:00Z');
    const stillToday = deriveDogActivity(
      [
        entry({
          id: 'day-2',
          show: SHOW,
          trial: { date: '2026-09-26', timezone: 'America/Chicago' },
        }),
      ],
      justAfterUtcMidnight
    );
    expect(stillToday.upcoming.map(e => e.id)).toEqual(['day-2']);

    // 08:00 UTC on Sep 27 is 03:00 CDT on Sep 27 — Chicago has now rolled
    // over, so the Sep-26 trial is genuinely past.
    const afterChicagoMidnight = new Date('2026-09-27T08:00:00Z');
    const nowPast = deriveDogActivity(
      [
        entry({
          id: 'day-2',
          show: SHOW,
          trial: { date: '2026-09-26', timezone: 'America/Chicago' },
        }),
      ],
      afterChicagoMidnight
    );
    expect(nowPast.upcoming).toEqual([]);
  });

  it('sorts upcoming entries by trial date, not the shared show start date', () => {
    // DB order puts the later trial first; every entry shares SHOW.start_date
    // so a sort keyed on the show date leaves them tied and DB-ordered.
    const today = new Date(2026, 8, 25);
    const activity = deriveDogActivity(
      [
        entry({
          id: 'day-6',
          show: SHOW,
          trial: { date: '2026-09-30', timezone: 'America/Chicago' },
        }),
        entry({
          id: 'day-3',
          show: SHOW,
          trial: { date: '2026-09-27', timezone: 'America/Chicago' },
        }),
      ],
      today
    );

    expect(activity.upcoming.map(e => e.id)).toEqual(['day-3', 'day-6']);
  });

  it('sorts recent results by trial date, most recent first, not the shared show start date', () => {
    const today = new Date(2026, 9, 5);
    const activity = deriveDogActivity(
      [
        entry({
          id: 'day-3',
          show: SHOW,
          trial: { date: '2026-09-27', timezone: 'America/Chicago' },
          entry_status: 'completed',
          is_scored: true,
          result_status: 'qualified',
        }),
        entry({
          id: 'day-6',
          show: SHOW,
          trial: { date: '2026-09-30', timezone: 'America/Chicago' },
          entry_status: 'completed',
          is_scored: true,
          result_status: 'qualified',
        }),
      ],
      today
    );

    expect(activity.recentResults.map(e => e.id)).toEqual(['day-6', 'day-3']);
  });

  it('does not throw when a trial carries an invalid, non-empty IANA timezone string', () => {
    expect(() =>
      deriveDogActivity(
        [
          entry({
            id: 'bad-timezone',
            show: SHOW,
            trial: { date: '2026-09-27', timezone: 'Not/AZone' },
          }),
        ],
        new Date(2026, 8, 25)
      )
    ).not.toThrow();
  });
});
