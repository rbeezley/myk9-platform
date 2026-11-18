import { fireEvent, screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { LedgerPayoutDetail, LedgerRow } from '@/features/payments/payoutLedger';

const approveMutate = vi.hoisted(() => vi.fn());
const holdMutate = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const online = vi.hoisted(() => ({ value: true }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock('@/features/payments/usePayoutApprovalActions', () => ({
  PAYOUT_LEDGER_QUERY_KEY: ['admin', 'payout-ledger'],
  useApprovePayout: () => ({ mutate: approveMutate, isPending: false }),
  useHoldPayout: () => ({ mutate: holdMutate, isPending: false }),
}));
vi.mock('@/lib/networkUtils', () => ({ useOnlineStatus: () => online.value }));

import { PayoutApprovalSection } from './PayoutApprovalSection';

function detail(overrides: Partial<LedgerPayoutDetail> = {}): LedgerPayoutDetail {
  return {
    id: 'payout-1',
    amountCents: 4500,
    approvedAt: null,
    approvedAmountCents: null,
    approvedStripeAccountId: null,
    holdReason: null,
    approvalResetReason: null,
    destination: { stripeAccountId: 'acct_club1', payoutsEnabled: true },
    ...overrides,
  };
}

function waiting(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    showId: 'show-1',
    showName: 'Spring Trial',
    clubId: 'c1',
    clubName: 'Club One',
    showUnavailable: false,
    onlineCollectedCents: 5000,
    refundedCents: 500,
    uncollectedRefundCents: 0,
    uncollectedRefundCount: 0,
    unresolvedRefundDecisionCount: 0,
    netOwedCents: 4500,
    netOwedSource: 'transfer',
    computedNetCents: 4500,
    settleDate: '2026-11-20',
    payoutStatus: 'awaiting_approval',
    stripeTransferId: null,
    payout: detail(),
    ...overrides,
  };
}

describe('PayoutApprovalSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    online.value = true;
  });

  it('lists a waiting payout with the figures it came from and its bank', () => {
    render(<PayoutApprovalSection rows={[waiting()]} />);
    const item = screen.getByTestId('waiting-payout');
    expect(within(item).getByText('Club One, Spring Trial')).toBeInTheDocument();
    expect(within(item).getByText('$50.00')).toBeInTheDocument();
    expect(within(item).getByText('-$5.00')).toBeInTheDocument();
    expect(within(item).getAllByText('$45.00')).toHaveLength(2);
    expect(within(item).getByText('acct_club1')).toBeInTheDocument();
    expect(within(item).getByText(/payouts enabled/)).toBeInTheDocument();
  });

  it('says so when the stored amount and the entries disagree', () => {
    render(<PayoutApprovalSection rows={[waiting({ computedNetCents: 4000 })]} />);
    expect(screen.getByRole('note')).toHaveTextContent(
      "Today's entries add up to $40.00, not $45.00"
    );
  });

  it('approves exactly the amount and Stripe account shown, after a confirm', () => {
    render(<PayoutApprovalSection rows={[waiting()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve up to $45.00' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('You will be asked for your password.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve up to $45.00' }));
    expect(approveMutate).toHaveBeenCalledWith(
      { payoutId: 'payout-1', amountCents: 4500, stripeAccountId: 'acct_club1' },
      expect.any(Object)
    );
  });

  it('approves what the dialog showed even if the ledger reloads behind it', () => {
    const { rerender } = render(<PayoutApprovalSection rows={[waiting()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve up to $45.00' }));
    // A reload lands while the confirm is open: new amount, new account.
    rerender(
      <PayoutApprovalSection
        rows={[
          waiting({
            payout: detail({
              amountCents: 9900,
              destination: { stripeAccountId: 'acct_other', payoutsEnabled: true },
            }),
          }),
        ]}
      />
    );
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Approve up to $45.00' })
    );
    expect(approveMutate).toHaveBeenCalledWith(
      { payoutId: 'payout-1', amountCents: 4500, stripeAccountId: 'acct_club1' },
      expect.any(Object)
    );
  });

  it('offers no Approve while the payout has no Stripe account', () => {
    render(<PayoutApprovalSection rows={[waiting({ payout: detail({ destination: null }) })]} />);
    expect(screen.getByRole('button', { name: 'Approve up to $45.00' })).toBeDisabled();
    expect(screen.getByText(/No Stripe account to send to/)).toBeInTheDocument();
  });

  it('closes the Hold dialog when the server refuses the hold', () => {
    holdMutate.mockImplementation((_input, options: { onError: (e: unknown) => void }) =>
      options.onError({
        code: '22023',
        message: 'This payout is processing, so it cannot be held',
      })
    );
    render(<PayoutApprovalSection rows={[waiting()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Wait' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hold payout' }));
    expect(toastError).toHaveBeenCalledWith(
      'The payout was not held. This payout is processing, so it cannot be held.'
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says plainly why an approval was refused over a changed amount', () => {
    approveMutate.mockImplementation((_input, options: { onError: (e: unknown) => void }) =>
      options.onError({ code: '22023', message: 'The amount is now 5000 cents; review it again' })
    );
    render(<PayoutApprovalSection rows={[waiting()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve up to $45.00' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Approve up to $45.00' })
    );
    expect(toastError).toHaveBeenCalledWith(
      'Nothing was approved. The amount changed since you looked. The new amount is shown; review it again.'
    );
  });

  it('holds with a reason and warns that the club can read it', () => {
    render(<PayoutApprovalSection rows={[waiting()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('The club can see this reason.');
    const holdButton = within(dialog).getByRole('button', { name: 'Hold payout' });
    expect(holdButton).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Reason'), {
      target: { value: 'Checking a refund first' },
    });
    fireEvent.click(holdButton);
    expect(holdMutate).toHaveBeenCalledWith(
      { payoutId: 'payout-1', reason: 'Checking a refund first' },
      expect.any(Object)
    );
  });

  it('shows a held payout with its reason, approvable and not held again', () => {
    render(
      <PayoutApprovalSection
        rows={[waiting({ payoutStatus: 'held', payout: detail({ holdReason: 'Club asked' }) })]}
      />
    );
    expect(screen.getByText('Club asked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve up to $45.00' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Hold' })).not.toBeInTheDocument();
  });

  it('blocks Approve and Hold while offline', () => {
    online.value = false;
    render(<PayoutApprovalSection rows={[waiting()]} />);
    expect(screen.getByText('You are offline. Payout decisions need a connection.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve up to $45.00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hold' })).toBeDisabled();
  });

  it('describes the approved amount as a ceiling the nightly run recalculates', () => {
    render(<PayoutApprovalSection rows={[waiting({ computedNetCents: 4000 })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve up to $45.00' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Up to $45.00 goes to Club One, Spring Trial on the next nightly run. The run recalculates first'
    );
  });
});
