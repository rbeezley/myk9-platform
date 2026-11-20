import { beforeEach, describe, expect, it, vi } from 'vitest';
import { within } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import { CloseOutShowAction } from '../CloseOutShowAction';
import { ShowCloseoutSummary } from '../ShowCloseoutSummary';
import { buildCloseoutReadiness } from '../showCloseOutShow';
import type { ShowDayReconciliationEntry } from '../showDayReconciliationSummary';
import { FAILED_FLAGS, NO_FLAGS, readFlags } from '@/features/show-closeout/flaggedPullsTestUtils';

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
const FLAGGED = {
  id: 'entry-1',
  dog_id: 'dog-1',
  entry_fee: 35,
  entry_status: 'confirmed',
  check_in_status: 'pulled',
  payment_status: 'paid',
  payment_method: 'online',
} satisfies ShowDayReconciliationEntry & { id: string; dog_id: string };
const FAILED_TEXT = "Couldn't check for dogs flagged as pulled at the show.";

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
    const readiness = buildCloseoutReadiness({
      ...CLEAN_SHOW,
      entries: [FLAGGED],
      flaggedPulls: readFlags([FLAGGED]),
    });

    expect(readiness.concerns).toEqual([FLAG_TEXT]);
    expect(readiness.concernItems).toEqual([{ kind: 'flagged-pulls', text: FLAG_TEXT }]);
  });

  it('adds no concern when no dog is flagged', () => {
    const readiness = buildCloseoutReadiness({
      ...CLEAN_SHOW,
      entries: [],
      flaggedPulls: NO_FLAGS,
    });

    expect(readiness).toEqual({ concerns: [], concernItems: [], hasConcerns: false });
  });

  it('reads the same on the summary card, the close action and its confirmation', async () => {
    const { user } = render(
      <>
        <ShowCloseoutSummary
          showId="show-1"
          entries={[FLAGGED]}
          deskWindow={null}
          flaggedPulls={readFlags([FLAGGED])}
        />
        <CloseOutShowAction
          {...CLEAN_SHOW}
          entries={[FLAGGED]}
          flaggedPulls={readFlags([FLAGGED])}
        />
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

  // MYK9-2180: a failed refresh, with the flag still in the cached rows.
  it('says "couldn\'t check" on the card, the close action and its confirmation, never a count', async () => {
    const readiness = buildCloseoutReadiness({
      ...CLEAN_SHOW,
      entries: [FLAGGED],
      flaggedPulls: FAILED_FLAGS,
    });
    expect(readiness.concernItems).toEqual([{ kind: 'flagged-pulls', text: FAILED_TEXT }]);

    const { user } = render(
      <>
        <ShowCloseoutSummary
          showId="show-1"
          entries={[FLAGGED]}
          deskWindow={null}
          flaggedPulls={FAILED_FLAGS}
        />
        <CloseOutShowAction {...CLEAN_SHOW} entries={[FLAGGED]} flaggedPulls={FAILED_FLAGS} />
      </>
    );

    const card = screen.getByRole('region', { name: 'Before you close the show' });
    expect(within(card).getByText(FAILED_TEXT)).toBeInTheDocument();
    const action = screen.getByRole('region', { name: 'Close the show' });
    expect(within(action).getByText(FAILED_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(FLAG_TEXT, { exact: false })).not.toBeInTheDocument();

    await user.click(within(action).getByRole('button', { name: 'Close the show' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(FAILED_TEXT)).toBeInTheDocument();
    expect(within(dialog).queryByText(FLAG_TEXT, { exact: false })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close anyway' })).toBeInTheDocument();
  });

  it('lists a flag whose class row is missing under "Class removed", with Confirm and Clear', () => {
    const orphan = { ...FLAGGED, dog: { name: 'Biscuit', call_name: null }, class: null };
    render(
      <ShowCloseoutSummary
        showId="show-1"
        entries={[FLAGGED]}
        deskWindow={null}
        flaggedPulls={readFlags([orphan])}
      />
    );

    const card = screen.getByRole('region', { name: 'Before you close the show' });
    expect(within(card).getByText(FLAG_TEXT)).toBeInTheDocument();
    const group = within(card).getByRole('group', { name: 'Class removed' });
    expect(within(group).getByText('Biscuit')).toBeInTheDocument();
    expect(
      within(group).getByRole('button', { name: 'Confirm the pull for Biscuit' })
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('button', { name: 'Clear the pull flag for Biscuit' })
    ).toBeInTheDocument();
  });
});
