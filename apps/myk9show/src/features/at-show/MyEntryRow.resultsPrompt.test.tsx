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
  ResultsPublicPrompt: (props: {
    showId: string;
    dogName: string;
    placement: number;
    handlerId?: string | null;
    ownerId?: string | null;
    coOwnerId?: string | null;
  }) => (
    <>
      <div data-testid="prompt">{`${props.showId}|${props.dogName}|${props.placement}`}</div>
      <div data-testid="prompt-ids">
        {[props.handlerId, props.ownerId, props.coOwnerId].map(id => String(id)).join('|')}
      </div>
    </>
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

function renderRow(own: OwnShowResult, showResultsPrompt = true) {
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
        showResultsPrompt={showResultsPrompt}
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

  it('passes the handler, owner and co-owner ids through, keeping null and undefined apart', () => {
    renderRow({ ...SCORED, handlerId: null, dogOwnerId: 'person-1', dogCoOwnerId: 'person-2' });
    expect(screen.getByTestId('prompt-ids')).toHaveTextContent('null|person-1|person-2');
  });

  it('a row that does not carry the ids passes undefined, not null', () => {
    renderRow(SCORED);
    expect(screen.getByTestId('prompt-ids')).toHaveTextContent('undefined|undefined|undefined');
  });

  it('renders nothing on a row the list did not pick', () => {
    renderRow(SCORED, false);
    expect(screen.queryByTestId('prompt')).not.toBeInTheDocument();
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
