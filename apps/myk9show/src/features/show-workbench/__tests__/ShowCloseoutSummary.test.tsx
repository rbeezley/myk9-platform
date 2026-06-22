import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { within } from '@testing-library/react';
import { ShowCloseoutSummary } from '../ShowCloseoutSummary';
import { summarizeCloseoutStatus } from '../showCloseoutStatus';

const mockListShowIncidentCloseout = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/show-incidents', () => ({
  listShowIncidentCloseout: mockListShowIncidentCloseout,
  showIncidentCloseoutQueryKey: (showId: string) => ['show-incidents', showId, 'closeout'],
}));

describe('summarizeCloseoutStatus', () => {
  it('rolls both halves into one amber chip when each needs review', () => {
    expect(
      summarizeCloseoutStatus({
        reconNeedsReview: true,
        pulledCount: 1,
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
        pulledCount: 0,
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
        pulledCount: 0,
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
        pulledCount: 0,
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
        pulledCount: 0,
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
  });

  it('renders desk-fee reconciliation by payment method', async () => {
    render(
      <ShowCloseoutSummary
        showId="show-1"
        entries={[
          {
            id: 'late-cash',
            is_day_of_show: true,
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
          },
        ]}
      />
    );

    expect(screen.getByRole('heading', { name: 'Show closeout' })).toBeInTheDocument();
    // The reconciliation half alone drives the rolled-up chip here (no incidents).
    expect(await screen.findByText('1 pulled · 1 review')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Show entries' })).getByText('1 day-of')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Collected late-entry fees' })).getByText('$35.00')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Pulled or no-show entries' })).getByText('1')
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Manual refund review' })).getByText(
        '$35.00 paid entries'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
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

    render(<ShowCloseoutSummary showId="show-1" entries={[]} />);

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
    render(<ShowCloseoutSummary showId="show-1" entries={[]} />);

    expect(await screen.findByText('Nothing to reconcile')).toBeInTheDocument();
    expect(
      screen.getByText('No reportable incident follow-up is waiting in this show.')
    ).toBeInTheDocument();
  });

  it('renders a loading state without empty-state copy', () => {
    mockListShowIncidentCloseout.mockReturnValueOnce(new Promise(() => undefined));

    render(<ShowCloseoutSummary showId="show-1" entries={[]} />);

    expect(screen.getByText('Checking incidents')).toBeInTheDocument();
    expect(screen.getByText('Checking the incident log...')).toBeInTheDocument();
    expect(
      screen.queryByText('No reportable incident follow-up is waiting in this show.')
    ).not.toBeInTheDocument();
  });

  it('renders an error state without empty-state copy', async () => {
    mockListShowIncidentCloseout.mockRejectedValueOnce(new Error('network failed'));

    render(<ShowCloseoutSummary showId="show-1" entries={[]} />);

    expect(await screen.findByText('Check incidents')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Could not load the incident closeout. Open the incident log in Tools before filing reports.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No reportable incident follow-up is waiting in this show.')
    ).not.toBeInTheDocument();
  });
});
