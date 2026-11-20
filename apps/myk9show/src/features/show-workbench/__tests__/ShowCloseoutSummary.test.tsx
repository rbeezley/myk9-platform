import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { FAILED_FLAGS, NO_FLAGS, readFlags } from '@/features/show-closeout/flaggedPullsTestUtils';
import { within } from '@testing-library/react';
import { ShowCloseoutSummary } from '../ShowCloseoutSummary';
import { summarizeCloseoutStatus } from '../showCloseoutStatus';

const mockListShowIncidentCloseout = vi.hoisted(() => vi.fn());

const mockListShowPayments = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/show-payments', () => ({
  listShowPayments: mockListShowPayments,
  showPaymentsQueryKey: (showId: string) => ['show-payments', showId],
}));

vi.mock('@/services/database/show-incidents', () => ({
  listShowIncidentCloseout: mockListShowIncidentCloseout,
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId, 'closeout'],
}));

describe('summarizeCloseoutStatus', () => {
  it('rolls both halves into one amber chip when each needs review', () => {
    expect(
      summarizeCloseoutStatus({
        reconNeedsReview: true,
        removals: { pulled: 1, withdrawn: 0, removed: 0, absent: 0 },
        refundReviewCount: 1,
        hasEntries: true,
        incidents: { state: 'ready', reportableCount: 2 },
      })
    ).toEqual({ label: '1 pulled · 1 review · 2 reportable', color: 'amber' });
  });

  it('reports an unconfirmed incident load as amber', () => {
    expect(
      summarizeCloseoutStatus({
        reconNeedsReview: false,
        removals: { pulled: 0, withdrawn: 0, removed: 0, absent: 0 },
        refundReviewCount: 0,
        hasEntries: true,
        incidents: { state: 'error' },
      })
    ).toEqual({ label: 'Check incidents', color: 'amber' });
  });

  it('stays stone while incidents are still loading and nothing else is flagged', () => {
    expect(
      summarizeCloseoutStatus({
        reconNeedsReview: false,
        removals: { pulled: 0, withdrawn: 0, removed: 0, absent: 0 },
        refundReviewCount: 0,
        hasEntries: true,
        incidents: { state: 'loading' },
      })
    ).toEqual({ label: 'Checking incidents', color: 'stone' });
  });

  it('is stone and ready to close when both halves are clean', () => {
    expect(
      summarizeCloseoutStatus({
        reconNeedsReview: false,
        removals: { pulled: 0, withdrawn: 0, removed: 0, absent: 0 },
        refundReviewCount: 0,
        hasEntries: true,
        incidents: { state: 'ready', reportableCount: 0 },
      })
    ).toEqual({ label: 'Ready to close', color: 'stone' });
  });

  it('signals nothing to reconcile when there are no entries', () => {
    expect(
      summarizeCloseoutStatus({
        reconNeedsReview: false,
        removals: { pulled: 0, withdrawn: 0, removed: 0, absent: 0 },
        refundReviewCount: 0,
        hasEntries: false,
        incidents: { state: 'ready', reportableCount: 0 },
      })
    ).toEqual({ label: 'Nothing to reconcile', color: 'stone' });
  });
});

describe('ShowCloseoutSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListShowIncidentCloseout.mockResolvedValue([]);
    mockListShowPayments.mockResolvedValue([]);
  });

  it('renders entries made and payments received during the show as separate figures', async () => {
    // The show-day entry's cash, as the server's desk-entry trigger records it.
    mockListShowPayments.mockResolvedValue([
      {
        id: 'row-1',
        enrollment_id: null,
        entry_id: 'late-cash',
        kind: 'payment',
        amount: '35.00',
        method: 'cash',
        received_on: '2026-09-17',
      },
    ]);
    render(
      <ShowCloseoutSummary
        flaggedPulls={NO_FLAGS}
        showId="show-1"
        deskWindow={{
          showStartDate: '2026-09-17',
          showEndDate: '2026-09-17',
          timeZone: 'America/New_York',
        }}
        entries={[
          {
            id: 'late-cash',
            submitted_at: '2026-09-17T14:00:00Z',
            entry_fee: 35,
            payment_status: 'paid',
            payment_method: 'cash',
          },
          {
            id: 'paid-scratch',
            entry_fee: 35,
            entry_status: 'scratched',
            check_in_status: 'pulled',
            payment_status: 'paid',
            payment_method: 'online',
          },
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Before you close the show' })).toBeInTheDocument();
    // The reconciliation half alone drives the rolled-up chip here (no incidents).
    expect(await screen.findByText('1 pulled · 1 review')).toBeInTheDocument();
    const payments = screen.getByRole('group', { name: 'Payments received during the show' });
    expect(await within(payments).findByText('1 payment during the show')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Entries made during the show' })).getByText('1')
    ).toBeInTheDocument();
    expect(mockListShowPayments).toHaveBeenCalledWith('show-1');
    expect(within(payments).getByText('$35.00')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Pulled or withdrawn entries' })).getByText('1')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Manual refund review' })).getByText(
        '$35.00 paid entries'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByText(/flagged as pulled at the show/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Check-in desk/ })).not.toBeInTheDocument();
  });

  // MYK9-2145: a flag stays a flag until the secretary confirms it at the Check-in desk.
  it('lists a paid check-in flag as flagged, not pulled, and links to the Check-in desk', async () => {
    const flagged = (id: string, dogId: string) => ({
      id,
      dog_id: dogId,
      entry_fee: 35,
      entry_status: 'confirmed',
      check_in_status: 'pulled',
      payment_status: 'paid',
      payment_method: 'online',
    });
    const entries = [flagged('e1', 'dog-1'), flagged('e2', 'dog-1'), flagged('e3', 'dog-2')];
    render(
      <ShowCloseoutSummary
        flaggedPulls={readFlags(entries)}
        showId="show-1"
        deskWindow={null}
        entries={entries}
      />
    );

    expect(await screen.findByText('2 flagged pulled')).toBeInTheDocument();
    expect(
      screen.getByText('2 dogs flagged as pulled at the show, not confirmed.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the Check-in desk' })).toHaveAttribute(
      'href',
      '/shows/show-1/entries?tab=exceptions&exception=check-in'
    );
    expect(
      within(screen.getByRole('group', { name: 'Pulled or withdrawn entries' })).getByText('0')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Manual refund review' })).getByText('0')
    ).toBeInTheDocument();
  });

  it('says "1 dog" for a single flagged dog', () => {
    const entry = {
      id: 'e1',
      dog_id: 'dog-1',
      entry_status: 'confirmed',
      check_in_status: 'pulled',
      payment_status: 'paid',
      payment_method: 'online',
    };
    render(
      <ShowCloseoutSummary
        flaggedPulls={readFlags([entry])}
        showId="show-1"
        deskWindow={null}
        entries={[entry]}
      />
    );

    expect(
      screen.getByText('1 dog flagged as pulled at the show, not confirmed.')
    ).toBeInTheDocument();
  });

  // MYK9-2180: a failed refresh is "couldn't check", never a count from the rows still cached.
  it('says the flags could not be checked when the latest entries read failed', async () => {
    render(
      <ShowCloseoutSummary
        flaggedPulls={FAILED_FLAGS}
        showId="show-1"
        deskWindow={null}
        entries={[
          {
            id: 'e1',
            entry_status: 'confirmed',
            check_in_status: 'pulled',
            payment_status: 'paid',
            payment_method: 'online',
          },
        ]}
      />
    );

    expect(
      screen.getByText("Couldn't check for dogs flagged as pulled at the show.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/flagged as pulled at the show, not confirmed/)
    ).not.toBeInTheDocument();
    expect(await screen.findByText('pull flags not checked')).toBeInTheDocument();
  });

  it('says the desk total is unavailable when the ledger cannot be read', async () => {
    mockListShowPayments.mockRejectedValue(new Error('offline'));
    render(
      <ShowCloseoutSummary
        flaggedPulls={NO_FLAGS}
        showId="show-1"
        deskWindow={{
          showStartDate: '2026-09-17',
          showEndDate: '2026-09-17',
          timeZone: 'America/New_York',
        }}
        entries={[]}
      />
    );

    const collected = screen.getByRole('group', { name: 'Payments received during the show' });
    expect(await within(collected).findByText('Unavailable')).toBeInTheDocument();
    expect(within(collected).queryByText('$0.00')).not.toBeInTheDocument();
    expect(within(collected).queryByText(/0 payments/)).not.toBeInTheDocument();
    expect(within(collected).getByText(/Unavailable: could not load payments/)).toBeInTheDocument();
  });

  it('shows no payment number, not even a zero, while the ledger read is still pending', async () => {
    let resolve: (rows: unknown[]) => void = () => {};
    mockListShowPayments.mockReturnValue(new Promise(r => (resolve = r)));
    render(
      <ShowCloseoutSummary
        flaggedPulls={NO_FLAGS}
        showId="show-1"
        deskWindow={{
          showStartDate: '2026-09-17',
          showEndDate: '2026-09-17',
          timeZone: 'America/New_York',
        }}
        entries={[]}
      />
    );

    const payments = screen.getByRole('group', { name: 'Payments received during the show' });
    expect(within(payments).getByText('…')).toBeInTheDocument();
    expect(within(payments).getByText('Checking payments…')).toBeInTheDocument();
    expect(within(payments).queryByText(/\$0\.00|0 payments/)).not.toBeInTheDocument();

    resolve([]);
    expect(await within(payments).findByText('0 payments during the show')).toBeInTheDocument();
  });

  it('renders reportable and urgent incident counts', async () => {
    mockListShowIncidentCloseout.mockResolvedValueOnce([
      {
        id: 'incident-urgent',
        incident_type: 'bite',
        severity: 'urgent',
        occurred_at: '2026-05-19T15:30:00.000Z',
        summary: 'Dog bite at gate',
        description: null,
        action_taken: null,
        dog_name: 'Rocket',
        handler_name: 'Jamie Walker',
        judge_name: 'Pat Judge',
        created_by_name: 'Jane Secretary',
        created_at: '2026-05-19T15:30:00.000Z',
      },
      {
        id: 'incident-note',
        incident_type: 'complaint',
        severity: 'note',
        occurred_at: '2026-05-19T14:30:00.000Z',
        summary: 'Parking complaint handled',
        description: null,
        action_taken: null,
        dog_name: null,
        handler_name: null,
        judge_name: null,
        created_by_name: 'Jane Secretary',
        created_at: '2026-05-19T14:30:00.000Z',
      },
    ]);

    render(
      <ShowCloseoutSummary flaggedPulls={NO_FLAGS} showId="show-1" entries={[]} deskWindow={null} />
    );

    expect(await screen.findByText('1 reportable')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'All incidents' })).getByText('2')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Reportable incidents' })).getByText('1')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Urgent incidents' })).getByText('1')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Latest reportable: Bite \/ aggression - Dog bite at gate/)
    ).toBeInTheDocument();
  });

  it('renders a calm empty incident state', async () => {
    render(
      <ShowCloseoutSummary flaggedPulls={NO_FLAGS} showId="show-1" entries={[]} deskWindow={null} />
    );

    expect(await screen.findByText('Nothing to reconcile')).toBeInTheDocument();
    expect(
      screen.getByText('No reportable incident follow-up is waiting in this show.')
    ).toBeInTheDocument();
  });

  it('renders a loading state without empty-state copy', () => {
    mockListShowIncidentCloseout.mockReturnValueOnce(new Promise(() => undefined));

    render(
      <ShowCloseoutSummary flaggedPulls={NO_FLAGS} showId="show-1" entries={[]} deskWindow={null} />
    );

    expect(screen.getByText('Checking incidents')).toBeInTheDocument();
    expect(screen.getByText('Checking the incident log...')).toBeInTheDocument();
    expect(
      screen.queryByText('No reportable incident follow-up is waiting in this show.')
    ).not.toBeInTheDocument();
  });

  it('renders an error state without empty-state copy', async () => {
    mockListShowIncidentCloseout.mockRejectedValueOnce(new Error('network failed'));

    render(
      <ShowCloseoutSummary flaggedPulls={NO_FLAGS} showId="show-1" entries={[]} deskWindow={null} />
    );

    expect(await screen.findByText('Check incidents')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Could not load the incidents for this show. Open the incident log in Tools before filing reports.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No reportable incident follow-up is waiting in this show.')
    ).not.toBeInTheDocument();
  });
});
