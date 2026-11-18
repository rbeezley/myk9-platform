import { beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { CloseOutShowAction } from '../CloseOutShowAction';
import { ShowCloseoutSummary } from '../ShowCloseoutSummary';
import { buildCloseoutReadiness } from '../showCloseOutShow';
import type { ShowDayReconciliationEntry } from '../showDayReconciliationSummary';

vi.mock('@/services/replication', () => ({
  replicatedShowsTable: { updateShow: vi.fn() },
  replicatedTrialsTable: { updateTrial: vi.fn() },
  replicatedClassesTable: { updateClass: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/services/database/show-payments', () => ({
  listShowPayments: vi.fn().mockResolvedValue([]),
  showPaymentsQueryKey: (showId: string) => ['show-payments', showId],
}));

vi.mock('@/services/database/show-incidents', () => ({
  listShowIncidentCloseout: vi.fn().mockResolvedValue([]),
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId, 'closeout'],
}));

const FLAG_TEXT = '1 dog flagged as pulled at the show, not confirmed.';
const DESK_HREF = '/shows/show-1/entries?tab=exceptions&exception=check-in';

/** A paid-online entry Ringside flagged pulled; the secretary has not confirmed it at the desk. */
const FLAGGED: ShowDayReconciliationEntry = {
  id: 'entry-1',
  dog_id: 'dog-1',
  entry_fee: 35,
  entry_status: 'confirmed',
  check_in_status: 'pulled',
  payment_status: 'paid',
  payment_method: 'online',
};

/** Everything else about the show is done: scored, results sent, no incidents. */
const CLEAN_SHOW = {
  show: { id: 'show-1', status: 'in_progress' },
  trials: [{ id: 'trial-1', status: 'in_progress' }],
  classes: [{ id: 'class-1', status: 'in_progress', entryCount: 1, scoredCount: 1 }],
  incidents: { reportableCount: 0, urgentCount: 0 },
  submissions: [{ status: 'sent' }],
};

describe('MYK9-2145: an unconfirmed pull flag at close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is its own close concern, not a removal or a refund to decide', () => {
    const readiness = buildCloseoutReadiness({ ...CLEAN_SHOW, entries: [FLAGGED] });

    expect(readiness.concerns).toEqual([FLAG_TEXT]);
    expect(readiness.concernItems).toEqual([{ kind: 'flagged-pulls', text: FLAG_TEXT }]);
  });

  it('adds no concern when no dog is flagged', () => {
    const readiness = buildCloseoutReadiness({ ...CLEAN_SHOW, entries: [] });

    expect(readiness).toEqual({ concerns: [], concernItems: [], hasConcerns: false });
  });

  it('reads the same on the summary card, the close action and its confirmation', async () => {
    const { user } = render(
      <>
        <ShowCloseoutSummary showId="show-1" entries={[FLAGGED]} deskWindow={null} />
        <CloseOutShowAction {...CLEAN_SHOW} entries={[FLAGGED]} />
      </>
    );

    const card = screen.getByRole('region', { name: 'Before you close the show' });
    expect(within(card).getByText(FLAG_TEXT)).toBeInTheDocument();
    expect(
      within(within(card).getByRole('group', { name: 'Pulled or withdrawn entries' })).getByText(
        '0'
      )
    ).toBeInTheDocument();
    expect(
      within(within(card).getByRole('group', { name: 'Manual refund review' })).getByText('0')
    ).toBeInTheDocument();

    const action = screen.getByRole('region', { name: 'Close the show' });
    expect(within(action).getByText('Review before closing the show')).toBeInTheDocument();
    expect(within(action).queryByText(/Nothing unresolved/)).not.toBeInTheDocument();
    expect(within(action).getByText(FLAG_TEXT, { exact: false })).toBeInTheDocument();
    expect(within(action).getByRole('link', { name: 'Open the Check-in desk' })).toHaveAttribute(
      'href',
      DESK_HREF
    );

    await user.click(within(action).getByRole('button', { name: 'Close the show' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(FLAG_TEXT, { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open the Check-in desk' })).toHaveAttribute(
      'href',
      DESK_HREF
    );
    expect(within(dialog).getByRole('button', { name: 'Close anyway' })).toBeInTheDocument();
  });
});
