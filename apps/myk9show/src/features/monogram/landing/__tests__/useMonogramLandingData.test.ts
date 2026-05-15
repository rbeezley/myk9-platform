import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useMonogramLandingData } from '../useMonogramLandingData';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Spring Scent Work Trial',
    organization: 'Bexar County Kennel Club',
    startDate: '2026-06-12',
    endDate: '2026-06-14',
    entryOpenDate: '2026-05-13',
    entryCloseDate: '2026-06-03',
    preEntryFee: '25',
    dayOfShowFee: '22',
    ...overrides,
  } as Show;
}

function makeTrial(overrides: Partial<Trial> = {}): Trial {
  return {
    id: 't1',
    trialNumber: 1,
    trialDate: '2026-06-12',
    ...overrides,
  } as Trial;
}

describe('useMonogramLandingData', () => {
  it('derives monogramLetters from the club name', () => {
    const show = makeShow({ organization: 'Bexar County Kennel Club' });
    const { result } = renderHook(() => useMonogramLandingData(show, null, []));
    expect(result.current.monogramLetters).toBe('BCK');
  });

  it('falls back to the show name when no club name is set', () => {
    const show = makeShow({ organization: undefined as unknown as string, name: 'Lone Pine Trial' });
    const { result } = renderHook(() => useMonogramLandingData(show, null, []));
    expect(result.current.monogramLetters).toBe('LPT');
  });

  it('returns "?" when neither club nor show name resolve', () => {
    const show = makeShow({
      organization: undefined as unknown as string,
      name: undefined as unknown as string,
    });
    const { result } = renderHook(() => useMonogramLandingData(show, null, []));
    expect(result.current.monogramLetters).toBe('?');
  });

  it('sorts trials by trial number and dedupes judges by name', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ id: 't3', trialNumber: 3, judge: 'Marcus Whitfield' }),
      makeTrial({ id: 't1', trialNumber: 1, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't2', trialNumber: 2, judge: 'Catherine Beagles' }),
    ];
    const { result } = renderHook(() => useMonogramLandingData(show, null, trials));

    expect(result.current.trials.map(t => t.id)).toEqual(['t1', 't2', 't3']);
    expect(result.current.judges.map(j => j.name)).toEqual([
      'Catherine Beagles',
      'Marcus Whitfield',
    ]);
    expect(result.current.judges[0]?.initials).toBe('CB');
    expect(result.current.judges[1]?.initials).toBe('MW');
  });

  it('accumulates uppercase-roman trial numbers per judge across multiple trials', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ id: 't1', trialNumber: 1, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't2', trialNumber: 2, judge: 'Marcus Whitfield' }),
      makeTrial({ id: 't3', trialNumber: 3, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't4', trialNumber: 4, judge: 'Catherine Beagles' }),
    ];
    const { result } = renderHook(() => useMonogramLandingData(show, null, trials));

    const beagles = result.current.judges.find(j => j.name === 'Catherine Beagles');
    const whitfield = result.current.judges.find(j => j.name === 'Marcus Whitfield');

    expect(beagles?.trials).toEqual(['I', 'III', 'IV']);
    expect(whitfield?.trials).toEqual(['II']);
  });

  it('does not duplicate trial numbers when same trial appears twice for a judge', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ id: 't1', trialNumber: 1, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't1-dup', trialNumber: 1, judge: 'Catherine Beagles' }),
    ];
    const { result } = renderHook(() => useMonogramLandingData(show, null, trials));
    expect(result.current.judges[0]?.trials).toEqual(['I']);
  });

  it('skips trials with no judge assigned when deriving the judges list', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ trialNumber: 1, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't2', trialNumber: 2 }), // no judge
    ];
    const { result } = renderHook(() => useMonogramLandingData(show, null, trials));
    expect(result.current.judges.length).toBe(1);
    expect(result.current.trials.length).toBe(2);
  });

  it('reports the highest configured entry limit across trials', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ id: 't1', trialNumber: 1, maxTotalEntries: 100 }),
      makeTrial({ id: 't2', trialNumber: 2, maxTotalEntries: 360 }),
      makeTrial({ id: 't3', trialNumber: 3, maxTotalEntries: 200 }),
    ];
    const { result } = renderHook(() => useMonogramLandingData(show, null, trials));
    expect(result.current.entryLimit).toBe(360);
  });

  it('returns null entryLimit when no trial has a max', () => {
    const show = makeShow();
    const trials: Trial[] = [makeTrial({ trialNumber: 1 })];
    const { result } = renderHook(() => useMonogramLandingData(show, null, trials));
    expect(result.current.entryLimit).toBeNull();
  });

  it('formats fees into label + amount pairs', () => {
    const show = makeShow({ preEntryFee: '25', dayOfShowFee: '22' });
    const { result } = renderHook(() => useMonogramLandingData(show, null, []));
    expect(result.current.fees).toEqual([
      { label: 'First entry', amount: expect.stringContaining('25') },
      { label: 'Each additional', amount: expect.stringContaining('22') },
    ]);
  });

  it('builds the entry wizard URL from the show id', () => {
    const show = makeShow({ id: 'show-abc' });
    const { result } = renderHook(() => useMonogramLandingData(show, null, []));
    expect(result.current.entryWizardUrl).toBe('/shows/show-abc/register');
  });

  it('falls back to /shows when no show is supplied', () => {
    const { result } = renderHook(() => useMonogramLandingData(null, null, []));
    expect(result.current.entryWizardUrl).toBe('/shows');
    expect(result.current.monogramLetters).toBe('?');
  });

  it('prefers the current trial entryCloseDate over the show-level fallback', () => {
    const show = makeShow({ entryCloseDate: '2026-06-03' });
    const trial = makeTrial({ entryCloseDate: '2026-05-30' }) as Trial;
    const { result } = renderHook(() => useMonogramLandingData(show, trial, []));
    expect(result.current.entryCloseDate).toBe('2026-05-30');
  });
});
