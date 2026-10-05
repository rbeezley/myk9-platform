/**
 * MYK9-1001: the Waitlist tab tracks open offers (the Offered group) and can withdraw one.
 * MYK9-1002: the offer dialog states the window in hours and the deadline in the trial's zone,
 * and says what the exhibitor is and is not told.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { NetworkStatusContext } from '@/hooks/useNetworkStatus';
import WaitlistManagementPage from '../index';

const h = vi.hoisted(() => {
  class WaitlistOfferNotWithdrawnError extends Error {}
  return {
    WaitlistOfferNotWithdrawnError,
    offers: [] as unknown[],
    withdraw: vi.fn(),
    toastWarning: vi.fn(),
    toastSuccess: vi.fn(),
    toastInfo: vi.fn(),
    toastError: vi.fn(),
    offer: (over: Record<string, unknown> = {}) => ({
      id: 'o1',
      class_id: 'c1',
      dog_id: 'dog-o1',
      exhibitor_id: 'ex1',
      handler_id: null,
      position: 1,
      status: 'offered',
      joined_via: 'online',
      // Chicago (CDT): offered Mon Oct 5 10:00 AM, pay by Wed Oct 7 10:00 AM.
      offered_at: '2026-10-05T15:00:00Z',
      offer_expires_at: '2026-10-07T15:00:00Z',
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-05T15:00:00Z',
      dog: { id: 'dog-o1', name: 'Bolt', call_name: 'Bolt' },
      class: { id: 'c1', name: 'Novice A', class_number: null, max_entries: null },
      promoted_entry_paid: false,
      trial_timezone: 'America/Chicago',
      trial_name: 'Trial 1',
      trial_date: '2026-10-10',
      ...over,
    }),
  };
});

vi.mock('@/services/database/waitlists', () => ({
  getClassesWithWaitlistCounts: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'c1',
        name: 'Novice A',
        class_number: '1',
        max_entries: null,
        trial_id: 't1',
        trial: { id: 't1', name: 'Trial 1', date: '2026-10-10', timezone: 'America/Chicago' },
        accepted_count: 1,
        waitlist_count: 1,
        offered_count: 1,
      },
    ],
    error: null,
  }),
  getWaitlistByClass: vi.fn().mockResolvedValue({
    data: [
      {
        id: 'w1',
        class_id: 'c1',
        dog_id: 'dog-w1',
        exhibitor_id: 'ex2',
        handler_id: null,
        position: 2,
        status: 'waiting',
        joined_via: 'online',
        offered_at: null,
        offer_expires_at: null,
        created_at: '2026-10-01T11:00:00Z',
        updated_at: '2026-10-01T11:00:00Z',
        dog: { id: 'dog-w1', name: 'Bella', call_name: 'Bella' },
        class: { id: 'c1', name: 'Novice A', class_number: null, max_entries: null },
      },
    ],
    error: null,
  }),
  getWaitlistOffersByClass: vi.fn(async () => ({ data: h.offers, error: null })),
  withdrawWaitlistOffer: h.withdraw,
  WaitlistOfferNotWithdrawnError: h.WaitlistOfferNotWithdrawnError,
  promoteWaitlistEntry: vi.fn(),
  removeFromWaitlist: vi.fn(),
  sendWaitlistOfferMessage: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    warning: h.toastWarning,
    success: h.toastSuccess,
    error: h.toastError,
    info: h.toastInfo,
  },
}));

vi.mock('@/components/shows/waitListSettingsQuery', () => ({
  waitListSettingsQueryOptions: (showId: string) => ({
    queryKey: ['waitlist-settings', showId],
    queryFn: async () => ({ config: { waitlistPaymentDeadlineHours: 24 }, autoOffer: true }),
  }),
}));

vi.mock('@/hooks/queries/useJudgeDayCapacity', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/queries/useJudgeDayCapacity')>()),
  useJudgeDayCapacity: () => ({ judgeDays: [], isPaused: false, error: null }),
}));

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: { subscribe: () => () => undefined },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { subscribe: () => () => undefined },
}));
vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { subscribe: () => () => undefined },
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ hasRole: () => true }),
}));

vi.mock('@/components/shows/WaitListSettingsCard', () => ({
  WaitListSettingsCard: () => <div data-testid="waitlist-settings-card" />,
}));

const offeredGroup = () => screen.findByTestId('waitlist-offered-group');

describe('WaitlistManagementPage offers', () => {
  beforeEach(() => {
    h.offers = [h.offer()];
    h.withdraw.mockReset();
    h.toastWarning.mockReset();
    h.toastSuccess.mockReset();
    h.toastInfo.mockReset();
    h.toastError.mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists an open offer with when it was offered, the pay-by deadline in the trial zone, and its payment state', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    const group = within(await offeredGroup());

    expect(group.getByText('Offered (1)')).toBeInTheDocument();
    expect(group.getByText('Bolt')).toBeInTheDocument();
    expect(group.getByText('Novice A')).toBeInTheDocument();
    expect(group.getByText('Mon, Oct 5, 10:00 AM CDT')).toBeInTheDocument();
    expect(group.getByText('Wed, Oct 7, 10:00 AM CDT')).toBeInTheDocument();
    expect(group.getByText('Waiting for payment')).toBeInTheDocument();
    // The offered dog is no longer in the queue; the waiting one is.
    expect(screen.getByText('Bella')).toBeInTheDocument();
  });

  it('shows a paid offer as being confirmed, with nothing to withdraw', async () => {
    h.offers = [h.offer({ promoted_entry_paid: true })];
    render(<WaitlistManagementPage showId="show-1" />);
    const group = within(await offeredGroup());

    expect(group.getByText('Paid, being confirmed')).toBeInTheDocument();
    expect(group.queryByRole('button', { name: /Withdraw offer/ })).not.toBeInTheDocument();
  });

  it('withdraws an offer from the tab after saying the exhibitor will be told', async () => {
    h.withdraw.mockResolvedValue({ result: 'withdrawn', notified: true });
    render(<WaitlistManagementPage showId="show-1" />);
    const group = within(await offeredGroup());

    fireEvent.click(group.getByRole('button', { name: /Withdraw offer/ }));
    const dialog = within(await screen.findByRole('alertdialog'));
    expect(dialog.getByText(/Their payment link stops working/)).toBeInTheDocument();
    expect(
      dialog.getByText(/The exhibitor is notified that no payment is due/)
    ).toBeInTheDocument();
    expect(dialog.queryByText(/let them know/)).not.toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Withdraw offer' }));
    await waitFor(() => expect(h.withdraw).toHaveBeenCalledWith('o1'));
    expect(h.toastWarning).not.toHaveBeenCalled();
  });

  it('keeps the withdrawal and tells the secretary when the exhibitor notice did not send', async () => {
    h.withdraw.mockResolvedValue({ result: 'withdrawn', notified: false });
    render(<WaitlistManagementPage showId="show-1" />);
    const group = within(await offeredGroup());

    fireEvent.click(group.getByRole('button', { name: /Withdraw offer/ }));
    const dialog = within(await screen.findByRole('alertdialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Withdraw offer' }));

    await waitFor(() =>
      expect(h.toastWarning).toHaveBeenCalledWith(
        "Offer withdrawn, but the exhibitor's notification didn't send. Let them know directly."
      )
    );
    expect(screen.queryByText(/Failed to withdraw/)).not.toBeInTheDocument();
  });

  it("shows the server's reason when a withdrawal is refused", async () => {
    h.withdraw.mockRejectedValue(
      new h.WaitlistOfferNotWithdrawnError(
        'This dog has already paid for the spot, so the offer cannot be withdrawn.'
      )
    );
    render(<WaitlistManagementPage showId="show-1" />);
    const group = within(await offeredGroup());

    fireEvent.click(group.getByRole('button', { name: /Withdraw offer/ }));
    const dialog = within(await screen.findByRole('alertdialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Withdraw offer' }));

    expect(
      await screen.findByText(
        'This dog has already paid for the spot, so the offer cannot be withdrawn.'
      )
    ).toBeInTheDocument();
  });

  it("states the show's offer window and its deadline in the trial zone before offering", async () => {
    // 2026-10-05 15:00 UTC + the show's 24 hours = Tue Oct 6, 10:00 AM in Chicago.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T15:00:00Z'));
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Bella');

    fireEvent.click(screen.getByRole('button', { name: /Offer Spot/ }));
    const dialog = await screen.findByRole('alertdialog');

    // Intl puts a narrow no-break space before AM/PM; read it as the plain space a person sees.
    const text = () => (dialog.textContent ?? '').replace(/\s+/g, ' ');
    await waitFor(() =>
      expect(text()).toContain('They have 24 hours to pay (until Tue, Oct 6, 10:00 AM CDT).')
    );
    expect(text()).toContain('creates an entry waiting for payment');
    expect(text()).not.toContain('accepted entries');
  });

  it('says a removal is not told to the exhibitor', async () => {
    render(<WaitlistManagementPage showId="show-1" />);
    await screen.findByText('Bella');

    fireEvent.click(screen.getByRole('button', { name: /Remove/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toContain('The exhibitor is not notified, so let them know.');
  });

  // Codex P2 on #2772: a show repeats a class across trials, so the class name alone cannot tell
  // two offers apart, and the Withdraw dialog must name the trial it acts on.
  it('names the trial on each offer and in the Withdraw dialog when two trials share a class name', async () => {
    h.withdraw.mockResolvedValue({ result: 'withdrawn', notified: true });
    h.offers = [
      h.offer(),
      h.offer({
        id: 'o2',
        class_id: 'c2',
        offered_at: '2026-10-05T16:00:00Z',
        class: { id: 'c2', name: 'Novice A', class_number: null, max_entries: null },
        trial_name: 'Trial 2',
        trial_date: '2026-10-11',
      }),
    ];
    render(<WaitlistManagementPage showId="show-1" />);
    const group = within(await offeredGroup());

    const rows = group.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/Trial 1 · /)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/Trial 2 · /)).toBeInTheDocument();

    fireEvent.click(within(rows[1]).getByRole('button', { name: /Withdraw offer/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(/Novice A \(Trial 2 · [^)]+\)/);
    expect(dialog.textContent).not.toContain('Trial 1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw offer' }));
    await waitFor(() => expect(h.withdraw).toHaveBeenCalledWith('o2'));
  });

  // Codex P2 on #2772: the server's answer is a result, not a boolean. Each one gets its own
  // plain message; a concurrent or already-closed offer is never reported as a failed notice.
  const withdrawWith = async (outcome: unknown) => {
    h.withdraw.mockResolvedValue(outcome);
    render(<WaitlistManagementPage showId="show-1" />);
    const group = within(await offeredGroup());
    fireEvent.click(group.getByRole('button', { name: /Withdraw offer/ }));
    const dialog = within(await screen.findByRole('alertdialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Withdraw offer' }));
    await waitFor(() => expect(h.withdraw).toHaveBeenCalledWith('o1'));
  };
  const toasts = () => ({
    success: h.toastSuccess.mock.calls.map(c => c[0]),
    warning: h.toastWarning.mock.calls.map(c => c[0]),
    info: h.toastInfo.mock.calls.map(c => c[0]),
    error: h.toastError.mock.calls.map(c => c[0]),
  });

  it.each([
    [
      'withdrawn and told',
      { result: 'withdrawn', notified: true },
      { success: ['Offer withdrawn. The exhibitor has been told no payment is due.'] },
    ],
    [
      'withdrawn but not told',
      { result: 'withdrawn', notified: false },
      {
        warning: [
          "Offer withdrawn, but the exhibitor's notification didn't send. Let them know directly.",
        ],
      },
    ],
    [
      'already lapsed',
      { result: 'expired', notified: true },
      {
        info: [
          'This offer had already run out of time, so it is closed. The exhibitor has been told it ended.',
        ],
      },
    ],
    [
      'already lapsed, not told',
      { result: 'expired', notified: false },
      {
        warning: [
          "This offer had already run out of time, so it is closed, but the exhibitor's notification didn't send. Let them know directly.",
        ],
      },
    ],
    [
      'already closed',
      { result: 'already_closed', status: 'declined' },
      { info: ['This offer was already closed. Nothing else was sent to the exhibitor.'] },
    ],
    [
      'already paid',
      { result: 'paid' },
      { error: ['This dog has already paid for the spot, so the offer cannot be withdrawn.'] },
    ],
    [
      'not found',
      { result: 'not_found' },
      { error: ['This offer was not found. It may have been removed.'] },
    ],
  ])('says the right thing when the offer was %s', async (_label, outcome, expected) => {
    await withdrawWith(outcome);
    await waitFor(() =>
      expect(toasts()).toEqual({ success: [], warning: [], info: [], error: [], ...expected })
    );
  });

  it('disables Withdraw offer offline, saying it is online only', async () => {
    render(
      <NetworkStatusContext.Provider
        value={{
          isOnline: false,
          quality: null,
          showOfflineMessage: true,
          retryConnection: vi.fn(),
        }}
      >
        <WaitlistManagementPage showId="show-1" />
      </NetworkStatusContext.Provider>
    );
    const group = within(await offeredGroup());
    expect(group.getByRole('button', { name: /Withdraw offer/ })).toBeDisabled();
    expect(group.getByTestId('waitlist-online-only')).toHaveTextContent('Online only');
  });
});
