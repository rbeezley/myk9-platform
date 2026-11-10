/**
 * MYK9-1847: an exhibitor's own entry in a cancelled class reads Cancelled and offers no
 * self check-in; the same entry in a running class still offers it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { ReplicatedEntry } from '@/services/replication';
import { MyEntryRow } from './MyEntryRow';
import { buildMyAtShowEntryDetails, type AtShowClassSummary } from './myAtShowEntryDetails.helpers';

function renderRow(classStatus: string) {
  const classes: ReadonlyMap<string, AtShowClassSummary> = new Map([
    ['class-1', { className: 'Container Novice A', classStatus, selfCheckinState: 'allowed' }],
  ]);
  const entry: ReplicatedEntry = {
    id: 'e1',
    classId: 'class-1',
    dogCallName: 'Ranger',
    armband: '7',
    runOrder: 2,
    isScored: false,
    checkInStatus: 'no-status',
  };
  const [detail] = buildMyAtShowEntryDetails([entry], new Set(['e1']), classes, new Map());
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
}

describe('MyEntryRow in a cancelled class', () => {
  it('shows Cancelled and no check-in button', () => {
    renderRow('cancelled');
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check in/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view class/i })).toBeInTheDocument();
  });

  it('offers check-in again when the class is no longer cancelled', () => {
    renderRow('in_progress');
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check in/i })).toBeInTheDocument();
  });
});
