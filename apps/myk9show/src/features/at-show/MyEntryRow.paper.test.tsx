/**
 * MYK9-1970 (owner, 2026-11-25): a paper class reads the paper line on the exhibitor's row
 * before check-in as well as after, and never a countdown.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { ReplicatedEntry } from '@/services/replication';
import { MyEntryRow } from './MyEntryRow';
import { buildMyAtShowEntryDetails, type AtShowClassSummary } from './myAtShowEntryDetails.helpers';

const PAPER_NOTE = 'This class is scored on paper. Listen for your number at the ring.';

function renderRow(overrides: Partial<ReplicatedEntry>, scoresOnPaper: boolean) {
  const classes: ReadonlyMap<string, AtShowClassSummary> = new Map([
    [
      'class-1',
      {
        className: 'Container Novice A',
        classStatus: 'in_progress',
        ...(scoresOnPaper ? { scoresOnPaper: true } : {}),
      },
    ],
  ]);
  const entry: ReplicatedEntry = {
    id: 'e1',
    classId: 'class-1',
    dogCallName: 'Ranger',
    armband: '7',
    runOrder: 2,
    isScored: false,
    ...overrides,
  };
  const [detail] = buildMyAtShowEntryDetails(
    [entry],
    new Set(['e1']),
    classes,
    new Map(),
    new Map()
  );
  if (!detail) throw new Error('no detail');
  render(
    <ul>
      <MyEntryRow
        showId="show-1"
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
}

describe('MyEntryRow on a paper class', () => {
  it('shows the paper line before check-in', () => {
    renderRow({ checkInStatus: 'no-status' }, true);
    const row = screen.getByTestId('at-show-my-entry-e1');
    expect(row).toHaveTextContent('In the running order');
    expect(row).toHaveTextContent(PAPER_NOTE);
    expect(row).not.toHaveTextContent(/Next up|\dth up|ahead/);
  });

  it('shows the paper line after check-in', () => {
    renderRow({ checkInStatus: 'checked-in' }, true);
    const row = screen.getByTestId('at-show-my-entry-e1');
    expect(row).toHaveTextContent(PAPER_NOTE);
    expect(row).not.toHaveTextContent(/Next up|\dth up|ahead/);
  });

  it('shows no paper line before check-in on a phone-scored class', () => {
    renderRow({ checkInStatus: 'no-status' }, false);
    expect(screen.getByTestId('at-show-my-entry-e1')).not.toHaveTextContent(PAPER_NOTE);
  });
});
