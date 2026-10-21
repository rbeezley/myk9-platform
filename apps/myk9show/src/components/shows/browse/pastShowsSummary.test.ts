import { describe, expect, it } from 'vitest';
import { showFactory } from '@/test/utils/factories';
import { monthKeyLabel, pastEmptyStateProps, summarizePastShows } from './pastShowsSummary';

const NOW = new Date('2026-10-20T15:00:00Z');
const make = (startDate: string, endDate = startDate, status = 'published') =>
  showFactory.build({
    startDate,
    endDate,
    status: status as 'published',
    entryWindowTimeZone: 'America/New_York',
  });

describe('summarizePastShows (MYK9-1283)', () => {
  it('counts the past shows and names the most recent one month', () => {
    const summary = summarizePastShows(
      [make('2026-08-02'), make('2026-10-02'), make('2026-09-12')],
      NOW
    );
    expect(summary).toEqual({ count: 3, monthKey: '2026-10' });
  });

  it('ignores upcoming and in-progress shows', () => {
    const summary = summarizePastShows(
      [make('2026-10-02'), make('2026-10-19', '2026-10-21'), make('2026-11-05')],
      NOW
    );
    expect(summary).toEqual({ count: 1, monthKey: '2026-10' });
  });

  it('returns null when every past show has an unparseable start date', () => {
    // A completed show with a bad date is past but has no month to open.
    expect(summarizePastShows([make('', '', 'completed')], NOW)).toBeNull();
  });

  it('returns null when nothing is past', () => {
    expect(summarizePastShows([make('2026-11-05')], NOW)).toBeNull();
    expect(summarizePastShows([], NOW)).toBeNull();
  });
});

describe('monthKeyLabel', () => {
  it('spells the month and year in full', () => {
    expect(monthKeyLabel('2026-10')).toBe('October 2026');
  });
});

describe('pastEmptyStateProps', () => {
  const base = {
    summary: { count: 2, monthKey: '2026-10' },
    month: 'all',
    hasActiveFilters: false,
    isEmpty: true,
  };

  it('gives the past props for the empty, unfiltered upcoming view', () => {
    expect(pastEmptyStateProps(base)).toEqual({
      past: { count: 2, monthLabel: 'October 2026' },
      monthKey: '2026-10',
    });
  });

  it.each([
    ['a month is selected', { month: '2026-10' }],
    ['filters are active', { hasActiveFilters: true }],
    ['the list is not empty', { isEmpty: false }],
    ['there are no past shows', { summary: null }],
  ])('returns null when %s', (_name, override) => {
    expect(pastEmptyStateProps({ ...base, ...override })).toBeNull();
  });
});
