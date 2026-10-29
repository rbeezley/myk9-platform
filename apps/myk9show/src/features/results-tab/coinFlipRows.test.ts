import { describe, expect, it } from 'vitest';

import type { ResultsClassRow } from './buildResultsClassRows';
import { applyCoinFlipPending } from './coinFlipRows';
import type { ResultsClassState } from './resultsNextAction';

const state: ResultsClassState = {
  classStatus: 'Completed',
  expectedCount: 8,
  scoredCount: 8,
  releasedAt: null,
  paperworkPrinted: false,
  verifiedAt: null,
};

const row = (id: string, overrides: Partial<ResultsClassRow> = {}): ResultsClassRow =>
  ({
    id,
    phase: 'needs-checking',
    phaseLabel: 'Needs checking',
    statusCompleted: true,
    nextAction: { kind: 'verify', label: 'Check scores' },
    state,
    ...overrides,
  }) as unknown as ResultsClassRow;

describe('applyCoinFlipPending', () => {
  it('turns Check scores into Record coin flip for the classes with a tie, and only those', () => {
    const rows = applyCoinFlipPending([row('tied'), row('plain')], new Set(['tied']));
    expect(rows[0]).toMatchObject({
      phase: 'needs-coin-flip',
      phaseLabel: 'Needs coin flip',
      nextAction: { kind: 'coin-flip', label: 'Record coin flip' },
    });
    expect(rows[1]).toMatchObject({ phase: 'needs-checking', nextAction: { kind: 'verify' } });
  });

  it('leaves a class that is not waiting for its check alone', () => {
    const released = row('done', { phase: 'released' });
    const unsaved = row('open', { statusCompleted: false });
    const rows = applyCoinFlipPending([released, unsaved], new Set(['done', 'open']));
    expect(rows).toEqual([released, unsaved]);
  });
});
