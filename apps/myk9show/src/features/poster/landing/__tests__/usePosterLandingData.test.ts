import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { usePosterLandingData } from '../usePosterLandingData';

vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: vi.fn(() => ({ data: [] })),
}));

// Helper to import the mocked module and re-stub its behavior per test.
async function setEntries(count: number) {
  const mod = await import('@/hooks/queries/useEntriesDatabase');
  const arr = Array.from({ length: count }, (_, i) => ({ id: `entry-${i}` })) as unknown[];
  (mod.useEntriesByShowQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    data: arr,
  });
}

function makeTrial(overrides: Partial<Trial>): Trial {
  return {
    id: 'trial-default',
    trialNumber: 1,
    trialDate: '2026-06-12',
    judge: undefined,
    maxTotalEntries: null,
    ...overrides,
  } as unknown as Trial;
}

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 'show-1',
    name: 'Spring Scent Work',
    organization: 'Bexar County Kennel Club',
    startDate: '2026-06-12',
    endDate: '2026-06-14',
    entryOpenDate: '2026-04-15',
    entryCloseDate: '2026-06-03',
    location: 'Live Oak Civic Center, San Antonio, TX',
    preEntryFee: '25',
    dayOfShowFee: '22',
    ...overrides,
  } as unknown as Show;
}

describe('usePosterLandingData', () => {
  it('returns empty shells when show is null', () => {
    const { result } = renderHook(() => usePosterLandingData(null, null, []));
    expect(result.current.clubName).toBe('');
    expect(result.current.showName).toBe('');
    expect(result.current.trials).toEqual([]);
    expect(result.current.judges).toEqual([]);
    expect(result.current.fees).toEqual([]);
    expect(result.current.entryCount).toBe(0);
    expect(result.current.entryLimit).toBeNull();
  });

  it('populates club, show, and venue from the show row', () => {
    const show = makeShow();
    const { result } = renderHook(() => usePosterLandingData(show, null, []));
    expect(result.current.clubName).toBe('Bexar County Kennel Club');
    expect(result.current.showName).toBe('Spring Scent Work');
    expect(result.current.trialStartDate).toBe('2026-06-12');
    expect(result.current.trialEndDate).toBe('2026-06-14');
    expect(result.current.venueAddress).toBe('Live Oak Civic Center, San Antonio, TX');
  });

  it('routes the wizard URL through /shows/:id/register when show id exists', () => {
    const show = makeShow({ id: 'abc-123' });
    const { result } = renderHook(() => usePosterLandingData(show, null, []));
    expect(result.current.entryWizardUrl).toBe('/shows/abc-123/register');
  });

  it('falls back to /shows when there is no show id', () => {
    const { result } = renderHook(() => usePosterLandingData(null, null, []));
    expect(result.current.entryWizardUrl).toBe('/shows');
  });

  it('sorts trials by numeric trialNumber regardless of input order', () => {
    const trials = [
      makeTrial({ id: 't3', trialNumber: 3 }),
      makeTrial({ id: 't1', trialNumber: 1 }),
      makeTrial({ id: 't2', trialNumber: '2' }),
    ];
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, trials));
    expect(result.current.trials.map(t => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('forwards trial date and judge to the assembled trial row', () => {
    const trials = [
      makeTrial({ id: 't1', trialNumber: 1, trialDate: '2026-06-12', judge: 'C. Beagles' }),
    ];
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, trials));
    expect(result.current.trials[0]).toMatchObject({
      id: 't1',
      trialNumber: 1,
      date: '2026-06-12',
      judgeName: 'C. Beagles',
    });
  });

  it('dedups judges by name and builds a TRIALS NN · NN label per judge', () => {
    const trials = [
      makeTrial({ id: 't1', trialNumber: 1, judge: 'C. Beagles' }),
      makeTrial({ id: 't2', trialNumber: 2, judge: 'M. Whitfield' }),
      makeTrial({ id: 't3', trialNumber: 3, judge: 'C. Beagles' }),
      makeTrial({ id: 't5', trialNumber: 5, judge: 'C. Beagles' }),
      makeTrial({ id: 't4', trialNumber: 4, judge: 'M. Whitfield' }),
    ];
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, trials));
    expect(result.current.judges).toHaveLength(2);

    const beagles = result.current.judges.find(j => j.name === 'C. Beagles');
    expect(beagles?.trialsLabel).toBe('TRIALS 01 · 03 · 05');

    const whitfield = result.current.judges.find(j => j.name === 'M. Whitfield');
    expect(whitfield?.trialsLabel).toBe('TRIALS 02 · 04');
  });

  it('skips trials that have no judge when building the judge list', () => {
    const trials = [
      makeTrial({ id: 't1', trialNumber: 1, judge: 'C. Beagles' }),
      makeTrial({ id: 't2', trialNumber: 2, judge: undefined }),
    ];
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, trials));
    expect(result.current.judges).toHaveLength(1);
    expect(result.current.judges[0]?.trialsLabel).toBe('TRIALS 01');
  });

  it('emits a fees row for pre-entry and additional fees with mocked sub-lines', () => {
    const show = makeShow({ preEntryFee: '25', dayOfShowFee: '22' } as Partial<Show>);
    const { result } = renderHook(() => usePosterLandingData(show, null, []));
    expect(result.current.fees).toEqual([
      { label: 'First entry', amount: '$25.00', sub: 'per dog, per trial' },
      { label: 'Each additional', amount: '$22.00', sub: 'same dog, additional trials' },
    ]);
  });

  it('omits the fees rows when fee values are missing', () => {
    const show = makeShow({ preEntryFee: undefined, dayOfShowFee: undefined } as Partial<Show>);
    const { result } = renderHook(() => usePosterLandingData(show, null, []));
    expect(result.current.fees).toEqual([]);
  });

  it('derives entryLimit as the max maxTotalEntries across all trials', () => {
    const trials = [
      makeTrial({ id: 't1', trialNumber: 1, maxTotalEntries: 120 }),
      makeTrial({ id: 't2', trialNumber: 2, maxTotalEntries: 360 }),
      makeTrial({ id: 't3', trialNumber: 3, maxTotalEntries: null }),
    ];
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, trials));
    expect(result.current.entryLimit).toBe(360);
  });

  it('returns null entryLimit when no trial carries a cap', () => {
    const trials = [
      makeTrial({ id: 't1', trialNumber: 1, maxTotalEntries: null }),
      makeTrial({ id: 't2', trialNumber: 2, maxTotalEntries: null }),
    ];
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, trials));
    expect(result.current.entryLimit).toBeNull();
  });

  it('reads entryCount from useEntriesByShowQuery', async () => {
    await setEntries(47);
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, []));
    expect(result.current.entryCount).toBe(47);
  });

  it('builds the showSubtitle from registry licenseLanguage + trial count', () => {
    const trials = [makeTrial({ id: 't1', trialNumber: 1 })];
    const { result } = renderHook(() => usePosterLandingData(makeShow(), null, trials));
    expect(result.current.showSubtitle).toMatch(/1 Trial$/);
    const trials2 = [
      makeTrial({ id: 't1', trialNumber: 1 }),
      makeTrial({ id: 't2', trialNumber: 2 }),
    ];
    const { result: result2 } = renderHook(() => usePosterLandingData(makeShow(), null, trials2));
    expect(result2.current.showSubtitle).toMatch(/2 Trials$/);
  });

  it('falls back to show.entryCloseDate when the current trial has none', () => {
    const show = makeShow({ entryCloseDate: '2026-06-03' });
    const { result } = renderHook(() => usePosterLandingData(show, null, []));
    expect(result.current.entryCloseDate).toBe('2026-06-03');
  });

  it('prefers the current trial entryCloseDate over the show value', () => {
    const show = makeShow({ entryCloseDate: '2026-06-03' });
    const trial = {
      id: 'current',
      entryCloseDate: '2026-05-30',
    } as unknown as Trial;
    const { result } = renderHook(() => usePosterLandingData(show, trial, []));
    expect(result.current.entryCloseDate).toBe('2026-05-30');
  });
});
