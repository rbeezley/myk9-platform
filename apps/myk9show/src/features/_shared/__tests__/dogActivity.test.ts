import { describe, expect, it } from 'vitest';
import { deriveDogActivity, formatActivityDate, type DogActivityEntry } from '../dogActivity';

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
});

describe('formatActivityDate', () => {
  it('formats date-only show dates as local calendar dates', () => {
    expect(formatActivityDate('2026-08-01')).toEqual({
      weekday: 'Sat',
      monthDay: 'Aug 1',
    });
  });
});
