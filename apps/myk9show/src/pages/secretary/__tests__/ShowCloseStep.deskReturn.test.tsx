import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, Route, Routes } from 'react-router-dom';
import { within } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import ShowCloseStep from '../ShowCloseStep';

/**
 * MYK9-2145: the close step's link to the Check-in desk is a round trip. A pull confirmed there
 * (a replica write, offline too) must show on return, even while the entries cache is fresh.
 */

const replica = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

vi.mock('@/services/database/entries', () => ({
  getEntriesForShow: vi.fn(async () => ({
    data: replica.rows.map(row => ({ ...row })),
    error: null,
  })),
  getEntriesByShow: vi.fn(),
  getPublicEntriesByShow: vi.fn(),
  getEntriesByDog: vi.fn(),
  getEntriesByStatus: vi.fn(),
  searchEntries: vi.fn(),
}));
vi.mock('@/hooks/queries/useRefreshShowEntriesOnOpen', () => ({
  useRefreshShowEntriesOnOpen: () => undefined,
}));
vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { subscribe: () => () => {} },
  replicatedShowsTable: { updateShow: vi.fn() },
  replicatedTrialsTable: { updateTrial: vi.fn() },
  replicatedClassesTable: { updateClass: vi.fn() },
}));
vi.mock('@/features/show-closeout/useResultsSentCheck', () => ({
  useResultsSentCheck: () => ({ submissions: [{ status: 'sent' }], scoreChanges: undefined }),
}));
vi.mock('@/services/database/show-incidents', () => ({
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId],
  listShowIncidentCloseout: vi.fn(async () => []),
}));
vi.mock('@/services/database/show-payments', () => ({
  listShowPayments: vi.fn(async () => []),
  showPaymentsQueryKey: (showId: string) => ['show-payments', showId],
}));
vi.mock('@/hooks/useFastShowDetails', () => ({
  useFastShowDetails: () => ({
    show: { id: 'show-1', status: 'published', startDate: '2026-10-10', endDate: '2026-10-10' },
    isLoading: false,
  }),
}));

const trialStoreState = vi.hoisted(() => ({
  trials: [{ id: 'trial-1', showId: 'show-1', status: 'active', trialDate: '2026-10-10' }],
  trialClasses: { 'trial-1': [{ id: 'class-1', status: 'completed' }] },
  trialsReadStatus: 'success',
  trialsHasConfirmedSnapshot: true,
  trialClassesReadStatus: 'success',
  trialClassesHasConfirmedSnapshot: true,
  loadTrials: vi.fn(),
  loadTrialClasses: vi.fn(),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: (selector: (state: typeof trialStoreState) => unknown) =>
    selector(trialStoreState),
}));

const ENTRY = {
  id: 'entry-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  trial_id: 'trial-1',
  show_id: 'show-1',
  entry_fee: 35,
  is_scored: false,
  check_in_status: 'pulled',
  payment_status: 'paid',
  payment_method: 'online',
};
const FLAG_TEXT = '1 dog flagged as pulled at the show, not confirmed.';

/** The desk's Confirm, as far as this step can see it: the replica row becomes a desk Pull. */
function DeskStub() {
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          replica.rows = [{ ...ENTRY, entry_status: 'scratched' }];
        }}
      >
        Confirm the pull
      </button>
      <Link to="/shows/show-1/results?step=close">Back to closing the show</Link>
    </div>
  );
}

describe('ShowCloseStep after a pull is confirmed at the Check-in desk', () => {
  beforeEach(() => {
    replica.rows = [{ ...ENTRY, entry_status: 'confirmed' }];
  });

  it('shows the confirmed pull and its refund to decide on return, not the old flag', async () => {
    const { user } = render(
      <Routes>
        <Route path="/shows/:id/results" element={<ShowCloseStep />} />
        <Route path="/shows/:id/entries" element={<DeskStub />} />
      </Routes>,
      { initialRoute: '/shows/show-1/results?step=close' }
    );

    const card = await screen.findByRole('region', { name: 'Before you close the show' });
    expect(within(card).getByText(FLAG_TEXT)).toBeInTheDocument();
    expect(
      within(within(card).getByRole('group', { name: 'Manual refund review' })).getByText('0')
    ).toBeInTheDocument();

    await user.click(within(card).getByRole('link', { name: 'Open the Check-in desk' }));
    await user.click(await screen.findByRole('button', { name: 'Confirm the pull' }));
    await user.click(screen.getByRole('link', { name: 'Back to closing the show' }));

    const back = await screen.findByRole('region', { name: 'Before you close the show' });
    expect(
      await within(within(back).getByRole('group', { name: 'Manual refund review' })).findByText(
        '1'
      )
    ).toBeInTheDocument();
    expect(within(back).queryByText(FLAG_TEXT)).not.toBeInTheDocument();
    expect(
      within(within(back).getByRole('group', { name: 'Pulled or withdrawn entries' })).getByText(
        '1'
      )
    ).toBeInTheDocument();
    const action = screen.getByRole('region', { name: 'Close the show' });
    expect(
      within(action).getByText('1 paid entry (1 pulled) needs refund review.')
    ).toBeInTheDocument();
    expect(within(action).queryByText(FLAG_TEXT, { exact: false })).not.toBeInTheDocument();
  });
});
