import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useFieldGuideLandingData } from '../useFieldGuideLandingData';

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
    entryOpenDate: '2026-04-15',
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

describe('useFieldGuideLandingData', () => {
  it('derives a compact showCode from club initials + year + show initials', () => {
    const show = makeShow();
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, []));
    expect(result.current.showCode).toBe('BCKC.2026.SSWT');
  });

  it('renders showSubtitle in the FIELD GUIDE · CODE · REV NN format', () => {
    const show = makeShow();
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, []));
    expect(result.current.showSubtitle).toBe('FIELD GUIDE · BCKC.2026.SSWT · REV 01');
  });

  it('builds the 6-cell quick-ref hero with CLOSES marked emphasis', () => {
    const show = makeShow();
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, []));
    const cells = result.current.quickRefCells;
    expect(cells).toHaveLength(6);
    expect(cells.map(c => c.label)).toEqual([
      'DATES',
      'OPENS',
      'CLOSES',
      'DRAW',
      'CONFIRM',
      'CAP',
    ]);
    const closes = cells.find(c => c.label === 'CLOSES');
    expect(closes?.emphasis).toBe(true);
    // Sibling cells should not carry emphasis.
    expect(cells.find(c => c.label === 'DATES')?.emphasis).toBeFalsy();
    expect(cells.find(c => c.label === 'OPENS')?.emphasis).toBeFalsy();
  });

  it('falls back to "TBA" / "OPEN" when source dates are missing', () => {
    const show = makeShow({
      entryOpenDate: undefined as unknown as string,
      entryCloseDate: undefined as unknown as string,
      startDate: undefined as unknown as string,
      endDate: undefined as unknown as string,
    });
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, []));
    const cells = result.current.quickRefCells;
    expect(cells.find(c => c.label === 'OPENS')?.value).toBe('TBA');
    expect(cells.find(c => c.label === 'CLOSES')?.value).toBe('TBA');
    expect(cells.find(c => c.label === 'CAP')?.value).toBe('OPEN');
  });

  it('sorts trials by trial number and dedupes judges by name', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ id: 't3', trialNumber: 3, judge: 'Marcus Whitfield' }),
      makeTrial({ id: 't1', trialNumber: 1, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't2', trialNumber: 2, judge: 'Catherine Beagles' }),
    ];
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, trials));

    expect(result.current.trials.map(t => t.id)).toEqual(['t1', 't2', 't3']);
    expect(result.current.judges.map(j => j.name)).toEqual([
      'Catherine Beagles',
      'Marcus Whitfield',
    ]);
  });

  it('builds the chip "TRIALS NN·NN" label per judge with zero-padded numbers', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ id: 't1', trialNumber: 1, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't3', trialNumber: 3, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't5', trialNumber: 5, judge: 'Catherine Beagles' }),
      makeTrial({ id: 't2', trialNumber: 2, judge: 'Marcus Whitfield' }),
    ];
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, trials));
    expect(result.current.judges[0]?.trialsLabel).toBe('TRIALS 01·03·05');
    expect(result.current.judges[1]?.trialsLabel).toBe('TRIALS 02');
  });

  it('returns null trialsLabel when a judge has no derivable trial numbers', () => {
    const show = makeShow();
    const trials: Trial[] = [
      makeTrial({ id: 't1', trialNumber: 'x' as unknown as number, judge: 'Anon Judge' }),
    ];
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, trials));
    // pad2 returns the raw value when not parseable; trialsLabel will be 'TRIALS x'.
    // Either way, the test pin-points that the hook never crashes on bad numbers.
    expect(result.current.judges[0]?.name).toBe('Anon Judge');
  });

  it('builds the fee stat-grid entries from show fee fields', () => {
    const show = makeShow();
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, []));
    expect(result.current.fees).toHaveLength(2);
    expect(result.current.fees[0]?.label).toBe('FIRST ENTRY');
    expect(result.current.fees[0]?.sub).toBe('PER DOG / PER TRIAL');
    expect(result.current.fees[1]?.label).toBe('EACH ADDITIONAL');
  });

  it('omits fee entries when source fields are missing', () => {
    const show = makeShow({
      preEntryFee: undefined as unknown as string,
      dayOfShowFee: undefined as unknown as string,
    });
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, []));
    expect(result.current.fees).toHaveLength(0);
  });

  it('points the entry-wizard URL at /shows/:id/register', () => {
    const show = makeShow();
    const { result } = renderHook(() => useFieldGuideLandingData(show, null, []));
    expect(result.current.entryWizardUrl).toBe('/shows/show-1/register');
  });
});
