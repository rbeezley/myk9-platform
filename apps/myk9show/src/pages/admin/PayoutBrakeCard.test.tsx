import { fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { LedgerPayout } from '@/features/payments/payoutLedger';
import type { PayoutBrakeState } from '@/features/payments/usePayoutBrake';

const brakeMutate = vi.hoisted(() => vi.fn());
const online = vi.hoisted(() => ({ value: true }));
const brakeState = vi.hoisted(() => ({
  data: undefined as PayoutBrakeState | undefined,
  isLoading: false,
  isError: false,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => online.value }));
vi.mock('@/features/payments/usePayoutBrake', () => ({
  usePayoutBrake: () => brakeState,
  useSetPayoutBrake: () => ({ mutate: brakeMutate, isPending: false }),
}));

import { PayoutBrakeCard } from './PayoutBrakeCard';

const matched: LedgerPayout = {
  id: 'p1',
  show_id: 's1',
  amount_cents: 4500,
  status: 'completed',
  stripe_transfer_id: 'tr_1',
  completed_at: null,
  created_at: null,
  approval: {
    approvedAt: '2026-11-18T10:00:00Z',
    approvedAmountCents: 4500,
    approvedStripeAccountId: 'acct_club1',
    holdReason: null,
    approvalResetReason: null,
    destination: { stripeAccountId: 'acct_club1', payoutsEnabled: true },
  },
};

describe('PayoutBrakeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online.value = true;
    brakeState.data = { on: true, changedAt: null, changedByName: null };
    brakeState.isLoading = false;
    brakeState.isError = false;
  });

  it('shows the running tally from the payout history', () => {
    render(<PayoutBrakeCard payouts={[matched]} />);
    expect(screen.getByTestId('payout-approval-tally')).toHaveTextContent(
      '1 payout approved, 1 sent for the approved amount'
    );
    expect(
      screen.getByText('Which Stripe account received each payout is not checked here yet.')
    ).toBeInTheDocument();
  });

  it('turns the brake off only after a confirm that says what it leaves waiting', () => {
    render(<PayoutBrakeCard payouts={[]} />);
    expect(screen.getByText(/No change has been recorded/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn the brake off' }));
    expect(brakeMutate).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Payouts already waiting or held still need Approve.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn the brake off' }));
    expect(brakeMutate).toHaveBeenCalledWith(false, expect.any(Object));
  });

  it('shows who switched the brake and when, and turns it back on', () => {
    brakeState.data = {
      on: false,
      changedAt: '2026-11-18T18:00:00Z',
      changedByName: 'Pat Operator',
    };
    render(<PayoutBrakeCard payouts={[]} />);
    expect(screen.getByText(/Switched off by Pat Operator on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Turn the brake on' }));
    expect(brakeMutate).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('keeps the brake reachable when the ledger is unread: on yes, off no', () => {
    render(<PayoutBrakeCard payouts={undefined} />);
    expect(screen.getByTestId('payout-approval-tally')).toHaveTextContent(
      'The approval tally could not be read yet.'
    );
    expect(screen.getByRole('button', { name: 'Turn the brake off' })).toBeDisabled();

    brakeState.data = { on: false, changedAt: null, changedByName: null };
    render(<PayoutBrakeCard payouts={undefined} />);
    expect(screen.getByRole('button', { name: 'Turn the brake on' })).toBeEnabled();
  });

  it('refuses to switch off if the tally became unreadable while the confirm was open', () => {
    const { rerender } = render(<PayoutBrakeCard payouts={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn the brake off' }));
    rerender(<PayoutBrakeCard payouts={undefined} />);
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Turn the brake off' })
    );
    expect(brakeMutate).not.toHaveBeenCalled();
  });

  it('does not offer the switch when the brake could not be read', () => {
    brakeState.data = undefined;
    brakeState.isError = true;
    render(<PayoutBrakeCard payouts={[]} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read the payout brake');
    expect(screen.queryByRole('button', { name: /Turn the brake/ })).not.toBeInTheDocument();
  });

  it('blocks the switch while offline', () => {
    online.value = false;
    render(<PayoutBrakeCard payouts={[]} />);
    expect(screen.getByText('You are offline. Payout decisions need a connection.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Turn the brake off' })).toBeDisabled();
  });
});
