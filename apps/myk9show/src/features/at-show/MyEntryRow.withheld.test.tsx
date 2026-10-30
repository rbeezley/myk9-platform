/**
 * MYK9-1519: a scored entry whose result the release preset withholds must say
 * so, not read as a bare "Completed". It still shows no score of any kind.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { ReplicatedEntry } from '@/services/replication';
import { MyEntryRow } from './MyEntryRow';
import {
  buildMyAtShowEntryDetails,
  type AtShowClassSummary,
  type OwnShowResult,
} from './myAtShowEntryDetails.helpers';

const classes: ReadonlyMap<string, AtShowClassSummary> = new Map([
  ['class-1', { className: 'Container Novice A', classStatus: 'completed' }],
]);

// What the masked read returns for each state.
const WITHHELD: OwnShowResult = {
  isScored: true,
  resultStatus: null,
  searchTimeSeconds: null,
  totalFaults: null,
  finalPlacement: null,
  resultsReleasedAt: null,
};
const PRELIMINARY: OwnShowResult = {
  ...WITHHELD,
  resultStatus: 'qualified',
  searchTimeSeconds: 42.5,
  totalFaults: 0,
};
const RELEASED: OwnShowResult = { ...PRELIMINARY, resultsReleasedAt: '2026-10-29T18:00:00Z' };
const NOT_SCORED: OwnShowResult = { ...WITHHELD, isScored: false };

function renderRow(own: OwnShowResult, entryScored = true) {
  const entry: ReplicatedEntry = {
    id: 'e1',
    classId: 'class-1',
    dogCallName: 'Ranger',
    armband: '7',
    runOrder: 2,
    isScored: entryScored,
    checkInStatus: entryScored ? 'completed' : 'checked-in',
  };
  const [detail] = buildMyAtShowEntryDetails(
    [entry],
    new Set(['e1']),
    classes,
    new Map(),
    new Map([['e1', own]])
  );
  if (!detail) throw new Error('no detail');
  render(
    <ul>
      <MyEntryRow
        detail={detail}
        place={undefined}
        placeUpdatedAt={null}
        conflictLabel={undefined}
        onOpenClass={vi.fn()}
        onCheckIn={vi.fn()}
        checkInPending={false}
      />
    </ul>
  );
  return screen.getByTestId('at-show-my-entry-e1');
}

describe('MyEntryRow: withheld results', () => {
  it('says the result is not released yet and leaks no score anywhere', () => {
    const row = renderRow(WITHHELD);

    expect(row).toHaveTextContent('Result not released yet');
    expect(row).not.toHaveTextContent(/preliminary/i);
    expect(row).not.toHaveTextContent('42.5');
    expect(row.textContent).not.toMatch(/\bQ\b|qualif/i);
    for (const el of [row, ...row.querySelectorAll('*')]) {
      for (const attr of ['aria-label', 'title', 'alt']) {
        expect(el.getAttribute(attr) ?? '').not.toMatch(/42|\bQ\b|qualif|place|fault/i);
      }
    }
  });

  it('keeps the released row as it was', () => {
    const row = renderRow(RELEASED);
    expect(row).toHaveTextContent('42.5s');
    expect(row).not.toHaveTextContent(/preliminary|not released/i);
  });

  it('keeps the unreleased preliminary row as it was', () => {
    const row = renderRow(PRELIMINARY);
    expect(row).toHaveTextContent('42.5s');
    expect(row).toHaveTextContent(/preliminary/i);
    expect(row).not.toHaveTextContent(/not released/i);
  });

  it('says nothing about a result for an entry that is not scored yet', () => {
    const row = renderRow(NOT_SCORED, false);
    expect(row).not.toHaveTextContent(/released|result|preliminary/i);
  });
});
