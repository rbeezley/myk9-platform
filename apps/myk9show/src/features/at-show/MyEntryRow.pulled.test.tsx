/**
 * MYK9-1258: a scored entry the secretary then pulled keeps its result
 * columns. The exhibitor's at-show row must show the pull, never the stale Q.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { ReplicatedEntry } from '@/services/replication';
import { MyEntryRow } from './MyEntryRow';
import {
  buildMyAtShowEntryDetails,
  deriveAtShowNextAction,
  type AtShowClassSummary,
  type OwnShowResult,
} from './myAtShowEntryDetails.helpers';

const own: ReadonlyMap<string, OwnShowResult> = new Map([
  [
    'e1',
    {
      isScored: true,
      resultStatus: 'qualified',
      searchTimeSeconds: 58,
      totalFaults: 0,
      finalPlacement: null,
      resultsReleasedAt: null,
    },
  ],
]);
const classes: ReadonlyMap<string, AtShowClassSummary> = new Map([
  ['class-1', { className: 'Container Novice A', classStatus: 'completed' }],
]);

function detailFor(overrides: Partial<ReplicatedEntry>) {
  const entry: ReplicatedEntry = {
    id: 'e1',
    classId: 'class-1',
    dogCallName: 'Ranger',
    armband: '7',
    runOrder: 2,
    isScored: true,
    ...overrides,
  };
  const [detail] = buildMyAtShowEntryDetails([entry], new Set(['e1']), classes, new Map(), own);
  if (!detail) throw new Error('no detail');
  return detail;
}

function renderRow(overrides: Partial<ReplicatedEntry>) {
  const detail = detailFor(overrides);
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
  return detail;
}

describe('MyEntryRow — a pulled entry that was scored first', () => {
  it.each([
    ['check-in pulled', { checkInStatus: 'pulled' as const }],
    ['entry status scratched', { entryStatus: 'scratched', checkInStatus: 'pulled' as const }],
  ])('shows no result chip, time or preliminary (%s)', (_label, overrides) => {
    const detail = renderRow(overrides);
    const row = screen.getByTestId('at-show-my-entry-e1');

    expect(row).toHaveTextContent(/won't be running this class/i);
    expect(row).not.toHaveTextContent(/preliminary/i);
    expect(row).not.toHaveTextContent('58');
    expect(row.textContent).not.toMatch(/\bQ\b/);
    expect(deriveAtShowNextAction(detail).kind).not.toBe('scored');
  });

  it('control — a scored, not-pulled entry still shows its result', () => {
    renderRow({ checkInStatus: 'completed' });
    const row = screen.getByTestId('at-show-my-entry-e1');

    expect(row).toHaveTextContent(/preliminary/i);
    expect(row).toHaveTextContent('58');
  });
});
