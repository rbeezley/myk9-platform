/**
 * MYK9-1970: a My Shows class that shows its running order says the class is scored on paper
 * when it is, and never makes a next-up or dogs-ahead claim either way.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { day, makeClass, makeRow, NOW, toOrders } from '@/test/fixtures/myShowsFixtures';
import { MyShowsList } from './MyShowsList';

const replica = vi.hoisted(() => ({
  usesDeviceScoring: false,
  scoresOnPaper: null as boolean | null,
  loading: false,
}));
const never = () => new Promise<never>(() => {});
vi.mock('@/services/replication', () => ({
  replicatedShowsTable: {
    getShowById: () =>
      replica.loading ? never() : Promise.resolve({ usesDeviceScoring: replica.usesDeviceScoring }),
    subscribe: vi.fn(() => vi.fn()),
  },
  replicatedTrialsTable: {
    getTrialsByShow: () => (replica.loading ? never() : Promise.resolve([{ id: 'trial-1' }])),
    getTrialById: vi.fn().mockResolvedValue(null),
  },
  replicatedClassesTable: {
    getClassesByTrial: () =>
      Promise.resolve([{ id: 'class-1', scoresOnPaper: replica.scoresOnPaper }]),
    getClassById: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn(() => vi.fn()),
  },
}));

const PAPER_NOTE = 'This class is scored on paper. Listen for your number at the ring.';

function renderRow() {
  const rows = [
    makeRow({
      classes: [
        makeClass({ id: 'later', classId: 'class-1', trialDate: day('2026-10-25'), runOrder: 5 }),
      ],
    }),
  ];
  return render(
    <MyShowsList
      filteredEntries={toOrders(rows)}
      source="confirmed"
      seenResultReleaseKeys={new Set<string>()}
      now={NOW}
      onCheckInDay={vi.fn()}
      onOpenCheckIn={vi.fn()}
      onOpenEdit={vi.fn()}
      onOpenReceipts={vi.fn()}
      onLeaveClass={vi.fn()}
    />
  );
}

describe('My Shows class row on a paper class (MYK9-1970)', () => {
  it('shows the paper note under the running order for a class following a paper show', async () => {
    replica.loading = false;
    replica.usesDeviceScoring = false;
    replica.scoresOnPaper = null;
    renderRow();
    expect(screen.getByTestId('class-row-running-order')).toHaveTextContent('Running order 5');
    expect(await screen.findByTestId('class-row-paper-note')).toHaveTextContent(PAPER_NOTE);
    expect(screen.queryByText(/dogs ahead|next up|\dth up/i)).not.toBeInTheDocument();
  });

  it('shows no paper note on a phone-scored class', async () => {
    replica.loading = false;
    replica.usesDeviceScoring = true;
    replica.scoresOnPaper = null;
    renderRow();
    await waitFor(() => expect(screen.getByTestId('class-row-running-order')).toBeInTheDocument());
    expect(screen.queryByText(PAPER_NOTE)).not.toBeInTheDocument();
  });

  it('claims nothing while the class rows are loading', () => {
    replica.loading = true;
    renderRow();
    expect(screen.getByTestId('class-row-running-order')).toBeInTheDocument();
    expect(screen.queryByText(PAPER_NOTE)).not.toBeInTheDocument();
  });
});
