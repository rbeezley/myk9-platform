import { fromAny } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';

import { calculateResultsRowsLeft } from '@/features/show-closeout/fromResultsRows';
import type { SyncableTrial } from '@/store/trial-store-types';
import { render } from '@/test/utils/testUtils';
import type { ResultsClassRow } from './buildResultsClassRows';
import type { ResultsClassPhase } from './resultsNextAction';
import { ResultsFinishRow } from './ResultsFinishRow';

const RELEASED = '2026-11-01T20:00:00Z';

const trialFor = (registryId?: string, id = 'trial-1') =>
  ({ id, showId: 'show-1', registryId }) as unknown as SyncableTrial;

function row(
  id: string,
  phase: ResultsClassPhase,
  overrides: Partial<ResultsClassRow> = {}
): ResultsClassRow {
  const cancelled = phase === 'cancelled';
  const noDogs = phase === 'no-dogs';
  const released = ['released', 'needs-initials', 'done'].includes(phase);
  return fromAny<ResultsClassRow, unknown>({
    id,
    trialId: 'trial-1',
    phase,
    expectedCount: noDogs || cancelled ? 0 : 4,
    scoredCount: noDogs || cancelled ? 0 : 4,
    releasedAt: released ? RELEASED : null,
    judgeSignedOffAt: phase === 'done' || phase === 'released' ? RELEASED : null,
    takesJudgeSignOff: !cancelled && !noDogs,
    ...overrides,
  });
}

// A show with a cancelled class and a class with no dogs among the real ones.
const SHOW_ROWS = [
  row('open-1', 'ready-to-release'),
  row('open-2', 'ready-to-release'),
  row('to-print', 'released'),
  row('to-initial', 'needs-initials'),
  row('finished', 'done'),
  row('cancelled', 'cancelled'),
  row('empty', 'no-dogs'),
];

function renderList(rows: ResultsClassRow[], trials: SyncableTrial[]) {
  render(<ResultsFinishRow showId="show-1" trials={trials} rows={rows} />);
  return within(screen.getByRole('region', { name: 'Finish the show' }));
}

describe('ResultsFinishRow', () => {
  it('shows the counts of the one calculation, cancelled and empty classes left out', () => {
    const list = renderList(SHOW_ROWS, [trialFor('AKC')]);
    const left = calculateResultsRowsLeft(SHOW_ROWS, [trialFor('AKC')]);
    const line = (kind: string) => left.lines.find(candidate => candidate.kind === kind);

    expect(line('unreleased')?.count).toBe(2);
    expect(line('to-print')?.count).toBe(1);
    expect(line('judge-sign-off')?.count).toBe(1);
    expect(list.getByRole('link', { name: '2 classes to release' })).toBeInTheDocument();
    expect(list.getByRole('link', { name: '1 class with results to print' })).toBeInTheDocument();
    expect(list.getByRole('link', { name: "1 class needs judge's initials" })).toBeInTheDocument();
  });

  it('links each line to a view filtered to the classes it counted', () => {
    const list = renderList(SHOW_ROWS, [trialFor('AKC')]);

    expect(list.getByRole('link', { name: '2 classes to release' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=unreleased'
    );
    expect(list.getByRole('link', { name: '1 class with results to print' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=to-print'
    );
    expect(list.getByRole('link', { name: "1 class needs judge's initials" })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=akc-judge-initials'
    );
    expect(list.getByRole('link', { name: 'Submit to AKC' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=submit'
    );
    expect(list.getByRole('link', { name: 'Close the show' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?step=close'
    );
  });

  it('ticks a line with nothing left', () => {
    const list = renderList([row('a', 'done'), row('b', 'cancelled')], [trialFor('AKC')]);

    expect(list.getByText('Every class is released')).toBeInTheDocument();
    expect(list.getByText('Results printed for every released class')).toBeInTheDocument();
    expect(list.getByText("Judge's initials collected")).toBeInTheDocument();
    expect(list.getAllByLabelText('Done')).toHaveLength(3);
    expect(list.queryByRole('link', { name: /to release/ })).not.toBeInTheDocument();
  });

  it.each([
    ['AKC', 'Submit to AKC', ['Submit to UKC', 'Submit to ASCA']],
    ['UKC', 'Submit to UKC', ['Submit to AKC', 'Submit to ASCA']],
    ['ASCA', 'Submit to ASCA', ['Submit to AKC', 'Submit to UKC']],
  ])('%s shows its own lines and none of the others', (registryId, own, others) => {
    const list = renderList(SHOW_ROWS, [trialFor(registryId)]);

    expect(list.getByRole('link', { name: own })).toBeInTheDocument();
    for (const other of others) expect(list.queryByRole('link', { name: other })).toBeNull();
  });

  it('words the judge line for the registry', () => {
    const list = renderList(SHOW_ROWS, [trialFor('UKC')]);

    expect(list.getByRole('link', { name: '1 class needs judge signature' })).toHaveAttribute(
      'href',
      '/shows/show-1/results?left=ukc-judge-signature'
    );
  });

  it('keeps Close the show when the show has no classes or trials yet', () => {
    const list = renderList([], []);

    expect(list.getByRole('link', { name: 'Close the show' })).toBeInTheDocument();
  });
});
