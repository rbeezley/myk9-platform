import { describe, it, expect } from 'vitest';
import { getTodayClassCounts } from '../todayClassCounts';
import type { Trial, TrialClass } from '@/store/trialStore';

const NOW = new Date('2030-08-02T15:00:00Z');
const TODAY = '2030-08-02';

const trial = (id: string, showId: string, trialDate: string, timezone?: string): Trial =>
  ({ id, showId, trialDate, timezone: timezone ?? 'America/Chicago' }) as unknown as Trial;

const cls = (id: string, status: string, isScoringFinalized = false, entries = 0): TrialClass =>
  ({ id, status, isScoringFinalized, entries }) as unknown as TrialClass;

describe('getTodayClassCounts', () => {
  it('gives each show its own counts', () => {
    const trials = [trial('t1', 'showA', TODAY), trial('t2', 'showB', TODAY)];
    const classes = {
      t1: [cls('a1', 'in_progress'), cls('a2', 'upcoming')],
      t2: [cls('b1', 'completed', true), cls('b2', 'completed', true), cls('b3', 'upcoming')],
    };
    expect(getTodayClassCounts('showA', trials, classes, NOW)).toEqual({
      live: 1,
      notStarted: 1,
      closed: 0,
    });
    expect(getTodayClassCounts('showB', trials, classes, NOW)).toEqual({
      live: 0,
      notStarted: 1,
      closed: 2,
    });
  });

  it('returns null when the show has no classes in the store yet', () => {
    const trials = [trial('t1', 'showA', TODAY)];
    expect(getTodayClassCounts('showA', trials, {}, NOW)).toBeNull();
    expect(getTodayClassCounts('showA', trials, { t1: [] }, NOW)).toBeNull();
    expect(getTodayClassCounts('unknown', trials, { t1: [cls('a', 'upcoming')] }, NOW)).toBeNull();
  });

  it('returns null when the only classes today are outside the three buckets', () => {
    const trials = [trial('t1', 'showA', TODAY)];
    // 'setup' and unfinalized 'completed' (results) map to stages the card does not show.
    const classes = { t1: [cls('a1', 'setup'), cls('a2', 'completed', false)] };
    expect(getTodayClassCounts('showA', trials, classes, NOW)).toBeNull();
  });

  it('excludes classes on trials not dated today', () => {
    const trials = [trial('t1', 'showA', TODAY), trial('t2', 'showA', '2030-08-03')];
    const classes = { t1: [cls('a1', 'in_progress')], t2: [cls('a2', 'in_progress')] };
    expect(getTodayClassCounts('showA', trials, classes, NOW)).toEqual({
      live: 1,
      notStarted: 0,
      closed: 0,
    });
  });

  it('decides "today" in the trial timezone, not the viewer timezone', () => {
    // 2030-08-03T03:00Z is still Aug 2 in Chicago, already Aug 3 in Tokyo.
    const late = new Date('2030-08-03T03:00:00Z');
    const classes = { t1: [cls('a1', 'in_progress')] };
    expect(
      getTodayClassCounts('showA', [trial('t1', 'showA', TODAY, 'America/Chicago')], classes, late)
    ).not.toBeNull();
    expect(
      getTodayClassCounts('showA', [trial('t1', 'showA', TODAY, 'Asia/Tokyo')], classes, late)
    ).toBeNull();
  });
});
