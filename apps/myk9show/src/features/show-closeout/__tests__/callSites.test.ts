import { describe, expect, it, vi } from 'vitest';

import { buildCloseoutReadiness } from '@/features/show-workbench/showCloseOutShow';
import { buildResultsReadinessSummary } from '@/pages/secretary/ResultsControlPage/readinessSummary';
import { calculateResultsRowsLeft } from '../fromResultsRows';

const calculate = vi.hoisted(() => vi.fn());

vi.mock('@/features/show-closeout/whatIsLeft', async importOriginal => {
  const original = await importOriginal<typeof import('../whatIsLeft')>();
  calculate.mockImplementation(original.calculateWhatIsLeft);
  return { ...original, calculateWhatIsLeft: calculate };
});

describe('the screens that count what is left read the one calculation', () => {
  it('the close step', () => {
    calculate.mockClear();
    buildCloseoutReadiness({ classes: [], entries: [], incidents: null, submissions: null });
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it('the Visibility settings sheet', () => {
    calculate.mockClear();
    buildResultsReadinessSummary([], []);
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it('the Results tab finish row and filter counts', () => {
    calculate.mockClear();
    calculateResultsRowsLeft([]);
    expect(calculate).toHaveBeenCalledTimes(1);
  });
});
