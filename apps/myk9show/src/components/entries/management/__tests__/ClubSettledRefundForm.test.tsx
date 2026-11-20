import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { RefundEntryDialog } from '../RefundEntryDialog';
import { ClubRefundBadge } from '../ClubRefundBadge';
import { PaymentStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import {
  ClubSettledRefundError,
  type ClubSettledRefundRow,
} from '@/services/database/club-settled-refunds';

const svc = vi.hoisted(() => ({
  status: vi.fn(),
  list: vi.fn(),
  record: vi.fn(),
  reverse: vi.fn(),
  online: vi.fn(),
}));
vi.mock('@/services/database/club-settled-refunds', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/club-settled-refunds')>()),
  getShowPayoutStatus: (...a: unknown[]) => svc.status(...a),
  listClubSettledRefunds: (...a: unknown[]) => svc.list(...a),
  recordClubSettledRefund: (...a: unknown[]) => svc.record(...a),
  reverseClubSettledRefund: (...a: unknown[]) => svc.reverse(...a),
  newClubRefundRetryKey: () => 'retry-key-1',
}));
vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => svc.online(),
}));
vi.mock('@/features/payments/useWithdrawalRefundSuggestion', () => ({
  useWithdrawalRefundSuggestion: () => ({ data: undefined, isLoading: false }),
}));

// $50 entry, $15 already refunded to the card, $10 the club already paid back: $25 left.
const entry = {
  id: 'entry-1',
  moneyRootEntryId: 'root-1',
  showId: 'show-1',
  dogName: 'Rex',
  totalFee: 50,
  refundAmount: 15,
  clubRefundedAmount: 10,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  paymentMethod: 'online',
  refundedAt: null,
} as unknown as EntryManagementEntry;

const earlier: ClubSettledRefundRow = {
  id: 'row-1',
  show_id: 'show-1',
  entry_id: 'root-1',
  amount: 10,
  reverses_id: null,
  paid_on: '2026-11-18',
  method: 'check',
  reference: '1042',
  note: null,
  recorded_by: 'person-1',
  client_refund_id: 'k-0',
  created_at: '2026-11-18T10:00:00Z',
};

function renderDialog(overrides: Partial<EntryManagementEntry> = {}) {
  const onRefunded = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <RefundEntryDialog
      open
      onOpenChange={onOpenChange}
      entry={{ ...entry, ...overrides }}
      onRefunded={onRefunded}
    />
  );
  return { onRefunded, onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.status.mockResolvedValue('completed');
  svc.list.mockResolvedValue([earlier]);
  svc.online.mockReturnValue(true);
});

describe('club settled refund form in the refund dialog', () => {
  it('shows the club form, and says no card refund is issued, only when the payout completed', async () => {
    renderDialog();
    expect(await screen.findByText('The club paid this back')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The club has already been paid for this show, so no card refund is issued. Record only money the club already paid the exhibitor.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /issue refund/i })).not.toBeInTheDocument();
  });

  it.each(['pending', 'processing', null])('keeps the card form when the payout is %s', async s => {
    svc.status.mockResolvedValue(s);
    renderDialog();
    expect(await screen.findByRole('button', { name: /issue refund/i })).toBeInTheDocument();
    await waitFor(() => expect(svc.status).toHaveBeenCalledWith('show-1'));
    expect(screen.queryByText('The club paid this back')).not.toBeInTheDocument();
  });

  it('prefills the amount with the remaining balance and refuses a larger one', async () => {
    renderDialog();
    const amount = await screen.findByLabelText(/^amount/i);
    expect(amount).toHaveValue(25);
    expect(screen.getByLabelText(/^amount/i)).toHaveAttribute('max', '25');

    const user = userEvent.setup();
    await user.clear(amount);
    await user.type(amount, '25.01');
    expect(screen.getByRole('button', { name: /save record/i })).toBeDisabled();
  });

  it('rejects a third decimal place even though Save bypasses the native step', async () => {
    renderDialog();
    const user = userEvent.setup();
    const amount = await screen.findByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, '10.123');
    expect(screen.getByText('Enter dollars and cents (two decimal places).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save record/i })).toBeDisabled();
  });

  it('takes the discount off the prefill and the displayed maximum', async () => {
    svc.list.mockResolvedValue([]);
    renderDialog({ totalFee: 50, discountAmount: 10, refundAmount: null, clubRefundedAmount: 0 });
    const amount = await screen.findByLabelText(/^amount/i);
    await waitFor(() => expect(amount).toHaveValue(40));
    expect(amount).toHaveAttribute('max', '40');
    expect(screen.getByLabelText('Amount (max $40.00)')).toBeInTheDocument();
  });

  it('records with the entered values, the money root and one retry key', async () => {
    svc.record.mockResolvedValue({ ...earlier, id: 'row-2', amount: 20 });
    const { onRefunded, onOpenChange } = renderDialog();
    const user = userEvent.setup();
    const amount = await screen.findByLabelText(/^amount/i);
    await user.clear(amount);
    await user.type(amount, '20');
    await user.click(screen.getByRole('radio', { name: 'Cash' }));
    await user.type(screen.getByLabelText(/check number or reference/i), 'receipt 7');
    await user.click(screen.getByRole('button', { name: /save record/i }));

    await waitFor(() =>
      expect(svc.record).toHaveBeenCalledWith({
        entryId: 'root-1',
        amount: 20,
        paidOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        method: 'cash',
        reference: 'receipt 7',
        note: '',
        clientRefundId: 'retry-key-1',
      })
    );
    await waitFor(() => expect(onRefunded).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    ['amount_exceeds_balance', /more than is left to refund/i],
    ['payout_not_completed', /has not been paid for this show yet/i],
    ['not_authorized', /only this show.s secretary or club admin/i],
    ['not_card_paid', /was not paid by card/i],
    ['invalid_amount', /greater than zero/i],
  ])('maps %s to secretary language', async (code, message) => {
    svc.record.mockRejectedValue(new ClubSettledRefundError(code, code));
    const { onRefunded } = renderDialog();
    const user = userEvent.setup();
    await screen.findByLabelText(/^amount/i);
    await user.click(screen.getByRole('button', { name: /save record/i }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(onRefunded).not.toHaveBeenCalled();
  });

  it('says it could not confirm for an unknown failure', async () => {
    svc.record.mockRejectedValue(new ClubSettledRefundError('fetch failed'));
    renderDialog();
    const user = userEvent.setup();
    await screen.findByLabelText(/^amount/i);
    await user.click(screen.getByRole('button', { name: /save record/i }));
    expect(await screen.findByText(/could not confirm the record/i)).toBeInTheDocument();
  });

  it('reverses an earlier record by its id after a confirm', async () => {
    svc.reverse.mockResolvedValue({ ...earlier, id: 'rev-1', amount: -10, reverses_id: 'row-1' });
    const { onRefunded } = renderDialog();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /this was a mistake/i }));
    expect(svc.reverse).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /yes, it was a mistake/i }));

    await waitFor(() =>
      expect(svc.reverse).toHaveBeenCalledWith({
        refundId: 'row-1',
        clientRefundId: 'retry-key-1',
      })
    );
    await waitFor(() => expect(onRefunded).toHaveBeenCalled());
  });

  it('says Needs a connection and disables Save offline', async () => {
    svc.online.mockReturnValue(false);
    renderDialog();
    expect(await screen.findByText('Needs a connection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save record/i })).toBeDisabled();
  });
});

describe('entry badge', () => {
  it('names the club, never the card word', () => {
    render(<ClubRefundBadge entry={{ clubRefundedAmount: 12.5 }} />);
    expect(screen.getByText('Refunded by the club $12.50')).toBeInTheDocument();
    expect(screen.queryByText(/^Refunded$/)).not.toBeInTheDocument();
  });

  it('shows nothing without a club refund', () => {
    const { container } = render(<ClubRefundBadge entry={{ clubRefundedAmount: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
