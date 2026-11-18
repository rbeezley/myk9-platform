/**
 * MYK9-1944: Ringside's "Your dogs today" row asks the results-public question on a released,
 * placed result and nowhere else.
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

vi.mock('@/components/preferences/ResultsPublicPrompt', () => ({
  ResultsPublicPrompt: (props: { showId: string; dogName: string; placement: number }) => (
    <div data-testid="prompt">{`${props.showId}|${props.dogName}|${props.placement}`}</div>
  ),
}));

const classes: ReadonlyMap<string, AtShowClassSummary> = new Map([
  ['class-1', { className: 'Container Novice A', classStatus: 'completed' }],
]);
const SCORED: OwnShowResult = {
  isScored: true,
  resultStatus: 'qualified',
  searchTimeSeconds: 42.5,
  totalFaults: 0,
  finalPlacement: 1,
  resultsReleasedAt: '2026-10-29T18:00:00Z',
  serverConfirmed: true,
};

function renderRow(own: OwnShowResult) {
  const entry: ReplicatedEntry = {
    id: 'e1',
    classId: 'class-1',
    dogCallName: 'Scout',
    armband: '7',
    runOrder: 2,
    isScored: true,
    checkInStatus: 'completed',
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

describe('MyEntryRow results-public prompt (MYK9-1944)', () => {
  it('renders the prompt on a released, placed result', () => {
    renderRow(SCORED);
    expect(screen.getByTestId('prompt')).toHaveTextContent('show-1|Scout|1');
  });

  it('renders nothing for a result that is not placed', () => {
    renderRow({ ...SCORED, finalPlacement: null });
    expect(screen.queryByTestId('prompt')).not.toBeInTheDocument();
  });

  it('renders nothing for a placement the class has not released', () => {
    renderRow({ ...SCORED, resultsReleasedAt: null });
    expect(screen.queryByTestId('prompt')).not.toBeInTheDocument();
  });
});
