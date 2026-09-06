import { describe, expect, it } from 'vitest';
import type { Show } from '@/types/show-types';
import {
  ALL_MONTHS_KEY,
  MAX_DOTS,
  MONTHS_AHEAD,
  MONTHS_BACK,
  buildMonthTiles,
  isMonthKey,
  monthKeyOf,
} from './monthScrubber.helpers';

// A fixed "now" so the fixture never drifts: Sunday 2026-09-06, local time.
const NOW = new Date(2026, 8, 6, 12, 0, 0);

function localISODate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Test Show',
    organization: 'AKC',
    startDate: '2026-10-20',
    endDate: '2026-10-22',
    location: 'Tulsa, OK',
    status: 'published',
    events: ['Scent Work'],
    source: 'myK9Show',
    entryOpenDate: '2026-08-01',
    entryCloseDate: '2099-01-01',
    preEntryFee: '25',
    clubId: 'club-1',
    clubName: 'Test Club',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    assignedJudges: [],
    stats: [],
    trials: [],
    ...overrides,
  } as Show;
}

describe('monthKeyOf / isMonthKey', () => {
  it('reads the local calendar month from a date-only or ISO string', () => {
    expect(monthKeyOf('2026-10-20')).toBe('2026-10');
    expect(monthKeyOf('2026-01-31T23:30:00Z')).toBe('2026-01');
  });

  it('rejects garbage', () => {
    expect(monthKeyOf(undefined)).toBeNull();
    expect(monthKeyOf('nope')).toBeNull();
    expect(monthKeyOf('2026-13-01')).toBeNull();
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('october')).toBe(false);
    expect(isMonthKey(null)).toBe(false);
  });
});

describe('buildMonthTiles', () => {
  it('returns the All tile plus one tile per month in the window, oldest first', () => {
    const tiles = buildMonthTiles([], NOW);
    expect(tiles).toHaveLength(1 + MONTHS_BACK + MONTHS_AHEAD + 1);
    expect(tiles[0].key).toBe(ALL_MONTHS_KEY);
    expect(tiles[1].key).toBe('2026-06');
    expect(tiles[MONTHS_BACK + 1].key).toBe('2026-09');
    expect(tiles.at(-1)?.key).toBe('2027-09');
    expect(tiles.map(t => t.count)).toEqual(tiles.map(() => 0));
  });

  it('marks months before the current one as past, and the current one as not past', () => {
    const tiles = buildMonthTiles([], NOW);
    const byKey = Object.fromEntries(tiles.map(t => [t.key, t]));
    expect(byKey['2026-06'].isPast).toBe(true);
    expect(byKey['2026-08'].isPast).toBe(true);
    expect(byKey['2026-09'].isPast).toBe(false);
    expect(byKey['2026-10'].isPast).toBe(false);
    expect(byKey[ALL_MONTHS_KEY].isPast).toBe(false);
  });

  it('labels a tile with its year only when the year changes', () => {
    const tiles = buildMonthTiles([], NOW);
    const byKey = Object.fromEntries(tiles.map(t => [t.key, t]));
    expect(byKey['2026-06'].year).toBe(2026);
    expect(byKey['2026-07'].year).toBeNull();
    expect(byKey['2027-01'].year).toBe(2027);
    expect(byKey['2027-02'].year).toBeNull();
  });

  it('counts shows by start month, including the 1st and the 31st', () => {
    const shows = [
      makeShow({ id: 'a', startDate: '2026-10-01', endDate: '2026-10-01' }),
      makeShow({ id: 'b', startDate: '2026-10-31', endDate: '2026-11-01' }),
      makeShow({ id: 'c', startDate: '2026-11-07', endDate: '2026-11-08' }),
    ];
    const byKey = Object.fromEntries(buildMonthTiles(shows, NOW).map(t => [t.key, t]));
    expect(byKey['2026-10'].count).toBe(2);
    expect(byKey['2026-11'].count).toBe(1);
    expect(byKey['2026-12'].count).toBe(0);
  });

  it('counts only upcoming shows on the All tile, but every show on its month', () => {
    const shows = [
      makeShow({ id: 'past', startDate: '2026-08-15', endDate: '2026-08-16' }),
      makeShow({ id: 'ending-today', startDate: '2026-09-05', endDate: '2026-09-06' }),
      makeShow({ id: 'future', startDate: '2026-10-20', endDate: '2026-10-22' }),
    ];
    const byKey = Object.fromEntries(buildMonthTiles(shows, NOW).map(t => [t.key, t]));
    expect(byKey[ALL_MONTHS_KEY].count).toBe(2);
    expect(byKey['2026-08'].count).toBe(1);
    expect(byKey['2026-09'].count).toBe(1);
  });

  it('draws one dot per show in date order, colored by entry status, capped', () => {
    // Entry status reads the wall clock, not `now`, so close dates are relative
    // to today and the shows sit in next month, which is always in the window.
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const key = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    const day = (d: number) => `${key}-${String(d).padStart(2, '0')}`;
    const shows = [
      makeShow({ id: 'closed', startDate: day(25), entryCloseDate: localISODate(-1) }),
      makeShow({ id: 'open', startDate: day(5), entryCloseDate: localISODate(60) }),
      makeShow({ id: 'closing', startDate: day(15), entryCloseDate: localISODate(3) }),
    ];
    const byKey = Object.fromEntries(buildMonthTiles(shows, today).map(t => [t.key, t]));
    expect(byKey[key].dots).toEqual(['open', 'closing', 'muted']);

    const many = Array.from({ length: MAX_DOTS + 4 }, (_, i) =>
      makeShow({ id: `m${i}`, startDate: day(i + 1) })
    );
    const tile = buildMonthTiles(many, today).find(t => t.key === key);
    expect(tile?.count).toBe(MAX_DOTS + 4);
    expect(tile?.dots).toHaveLength(MAX_DOTS);
  });

  it('skips a show with no parseable start date instead of throwing', () => {
    const tiles = buildMonthTiles([makeShow({ id: 'bad', startDate: '', endDate: '' })], NOW);
    expect(tiles.every(t => t.count === 0)).toBe(true);
  });
});
