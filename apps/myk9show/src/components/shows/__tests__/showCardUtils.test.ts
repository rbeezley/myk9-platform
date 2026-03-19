import { describe, it, expect, vi, afterEach } from 'vitest';
import { getShowCardStatus, computeShowProgress, countUserEntries } from '@/utils/showCardUtils';
import type { Show } from '@/types/show-types';

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: '1',
    name: 'Test Show',
    startDate: '2026-06-01',
    endDate: '2026-06-03',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    trials: [],
    organization: 'AKC',
    location: 'Test Location',
    status: 'Published',
    events: [],
    source: 'myK9Show',
    preEntryFee: '10.00',
    clubId: 'c1',
    clubName: '',
    clubAddress: '',
    clubEmail: '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    chairman: '',
    secretary: '',
    chiefSteward: '',
    assignedJudges: [],
    stats: [],
    ...overrides,
  } as Show;
}

describe('getShowCardStatus', () => {
  afterEach(() => vi.useRealTimers());

  it('returns "completed" when show end date is in the past', () => {
    vi.setSystemTime(new Date('2026-06-10'));
    const show = makeShow({ endDate: '2026-06-03' });
    expect(getShowCardStatus(show, 'closed')).toBe('completed');
  });

  it('returns "in_progress" when now is between start and end dates', () => {
    vi.setSystemTime(new Date('2026-06-02'));
    const show = makeShow({ startDate: '2026-06-01', endDate: '2026-06-03' });
    expect(getShowCardStatus(show, 'closed')).toBe('in_progress');
  });

  it('returns "accepting" when show is in future and entries are open', () => {
    vi.setSystemTime(new Date('2026-04-15'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'accepting')).toBe('accepting');
  });

  it('returns "closing_soon" when show is in future and entries closing soon', () => {
    vi.setSystemTime(new Date('2026-05-12'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'closing_soon')).toBe('closing_soon');
  });

  it('returns "closed" when show is in future but entries are closed', () => {
    vi.setSystemTime(new Date('2026-05-20'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'closed')).toBe('closed');
  });

  it('returns "upcoming" when show is in future and entries not yet open', () => {
    vi.setSystemTime(new Date('2026-03-15'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'not_yet_open')).toBe('upcoming');
  });

  it('returns "upcoming" for submitted status (user already entered)', () => {
    vi.setSystemTime(new Date('2026-04-15'));
    const show = makeShow();
    expect(getShowCardStatus(show, 'submitted')).toBe('upcoming');
  });
});

describe('computeShowProgress', () => {
  it('returns zeros when show has no trials', () => {
    const show = makeShow({ trials: [] });
    expect(computeShowProgress(show)).toEqual({ totalTrials: 0, scoredTrials: 0 });
  });

  it('counts completed trials case-insensitively', () => {
    const show = makeShow({
      trials: [
        { id: '1', status: 'completed' },
        { id: '2', status: 'Completed' },
        { id: '3', status: 'in_progress' },
      ] as any,
    });
    expect(computeShowProgress(show)).toEqual({ totalTrials: 3, scoredTrials: 2 });
  });

  it('handles undefined trials array', () => {
    const show = makeShow();
    (show as any).trials = undefined;
    expect(computeShowProgress(show)).toEqual({ totalTrials: 0, scoredTrials: 0 });
  });
});

describe('countUserEntries', () => {
  it('counts entries matching by showId field', () => {
    const entries = [{ showId: 'show-1' }, { showId: 'show-1' }, { showId: 'show-2' }];
    expect(countUserEntries('show-1', entries)).toBe(2);
  });

  it('counts entries matching by show_id field', () => {
    const entries = [{ show_id: 'show-1' }, { show_id: 'show-2' }, { show_id: 'show-1' }];
    expect(countUserEntries('show-1', entries)).toBe(2);
  });

  it('returns 0 when no entries match', () => {
    const entries = [{ showId: 'show-2' }, { show_id: 'show-3' }];
    expect(countUserEntries('show-1', entries)).toBe(0);
  });

  it('returns 0 for empty entries array', () => {
    expect(countUserEntries('show-1', [])).toBe(0);
  });
});
