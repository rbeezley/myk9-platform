import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { MyEntry } from './my-entries-types';

const { useEntryReceiptOrdersMock, refetch } = vi.hoisted(() => ({
  useEntryReceiptOrdersMock: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('@/features/payments/entryReceiptOrder', () => ({
  useEntryReceiptOrders: useEntryReceiptOrdersMock,
}));

import { ReceiptEntryDialog } from './MyEntriesDialogs';

const splitRegistration: MyEntry = {
  id: 'entry-a',
  registrationId: 'registration-split',
  showId: 'show-1',
  showName: 'Two-Day Trial',
  showDate: new Date('2026-09-01T12:00:00Z'),
  location: { venue: 'Fairgrounds', city: 'Tulsa', state: 'OK' },
  dogName: 'Cooper',
  dogId: 'dog-1',
  classes: [
    { id: 'entry-a', name: 'Novice', number: '101', fee: 60, status: 'entered' },
    { id: 'entry-b', name: 'Advanced', number: '201', fee: 70, status: 'entered' },
  ],
  dogs: [],
  totalFee: 130,
  entryStatus: EntryStatus.ACCEPTED,
  paymentStatus: PaymentStatus.PAID_ONLINE,
  submittedAt: new Date('2026-08-01T12:00:00Z'),
  lastUpdated: new Date('2026-08-02T12:00:00Z'),
};

// order-1 pays for the $60 Novice row plus a $5 platform fee; order-2 pays for
// the $70 Advanced row plus $5. Fee and subtotal are deliberately different
// numbers from the row fees so a receipt that re-sums the rows, or prints the
// gross as the line total, is distinguishable from one that balances.
const receiptOrders = [
  {
    id: 'order-1',
    createdAt: '2026-08-01T12:00:00Z',
    amountCents: 6500,
    currency: 'usd',
    reference: 'pi_order_1',
    status: 'succeeded',
    entryIds: ['entry-a'],
    entrySubtotalCents: 6000,
    platformFeeCents: 500,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    refundedAt: null,
  },
  {
    id: 'order-2',
    createdAt: '2026-08-09T12:00:00Z',
    amountCents: 7500,
    currency: 'usd',
    reference: 'pi_order_2',
    status: 'succeeded',
    entryIds: ['entry-b'],
    entrySubtotalCents: 7000,
    platformFeeCents: 500,
    refundedCents: 0,
    makeWholeRefundedCents: 0,
    refundedAt: null,
  },
];

describe('ReceiptEntryDialog order resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers one receipt choice per order for direct access to a split registration', () => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: receiptOrders,
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={{ email: 'handler@example.com' }}
        onClose={vi.fn()}
      />
    );

    // Named by date and amount: a raw UUID tells the exhibitor nothing about
    // which of their two payments they are choosing between.
    expect(
      screen.getByRole('button', { name: /\$65\.00 payment on Aug 1, 2026/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /\$75\.00 payment on Aug 9, 2026/i })
    ).toBeInTheDocument();
    expect(screen.queryByText('Amount charged')).not.toBeInTheDocument();
  });

  it('renders only the selected order entries, amount, status, and identifiers', async () => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: receiptOrders,
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={{ email: 'handler@example.com' }}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /\$65\.00 payment on Aug 1, 2026/i }));

    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    // The document balances: $60 entry fee + $5 platform fee = $65 charged.
    // Read the totals block specifically — $60.00 legitimately appears twice,
    // once as the class row fee and once as the subtotal it adds up to.
    const totals = within(screen.getByText('Entry fees').closest('dl') as HTMLElement);
    expect(totals.getByText('$60.00')).toBeInTheDocument();
    expect(totals.getByText('Platform fee')).toBeInTheDocument();
    expect(totals.getByText('$5.00')).toBeInTheDocument();
    expect(totals.getByText('Amount charged')).toBeInTheDocument();
    expect(totals.getByText('$65.00')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Order ID')).toBeInTheDocument();
    expect(screen.getByText('order-1')).toBeInTheDocument();
    expect(screen.getByText('Payment reference')).toBeInTheDocument();
    expect(screen.getByText('pi_order_1')).toBeInTheDocument();
    expect(screen.getByText('Entry ID: entry-a')).toBeInTheDocument();
  });

  it('preserves the direct single-order receipt path without a chooser', () => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [receiptOrders[0]],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.getByText('$65.00')).toBeInTheDocument();
    expect(screen.queryByText('Choose a receipt')).not.toBeInTheDocument();
    expect(screen.queryByText(/could not reach|still syncing/i)).not.toBeInTheDocument();
  });

  it('does not show the charged amount while an order entry is not replicated', () => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [{ ...receiptOrders[0], amountCents: 14000, entryIds: ['entry-a', 'missing'] }],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />,
      // The order arrives in the URL, exactly as My Payments' Receipt link
      // sends it. Driving it as a prop would leave the URL-to-dialog seam —
      // the one line that makes the deep link work — untested.
      { initialRoute: '/exhibitor/entries?orderId=order-1' }
    );

    // Falls back to the card receipt rather than dead-ending: the entry fees
    // are known and printable, and only the exact charge is not.
    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.getByText(/still syncing/i)).toBeInTheDocument();
    expect(screen.queryByText('$140.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Amount charged')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it.each([
    ['refunded', 'Refunded'],
    ['pending', 'Pending'],
    ['failed', 'Failed'],
  ])('uses the exact %s order status', (status, label) => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [{ ...receiptOrders[0], status }],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />,
      // The order arrives in the URL, exactly as My Payments' Receipt link
      // sends it. Driving it as a prop would leave the URL-to-dialog seam —
      // the one line that makes the deep link work — untested.
      { initialRoute: '/exhibitor/entries?orderId=order-1' }
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
  });

  it('shows a loading state instead of an inaccurate receipt', () => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Preparing receipt')).toBeInTheDocument();
    expect(screen.queryByText('Entry Receipt')).not.toBeInTheDocument();
  });

  it('shows a retryable unavailable state when the order query fails', async () => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />
    );

    // Unavailable is not empty, but it is also not a dead end: print what the
    // card knows and say plainly that it is not the confirmed charge.
    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.getByText(/could not reach the payment record/i)).toBeInTheDocument();
    expect(screen.queryByText('Amount charged')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('prints the card receipt when the registration has no Stripe order at all', () => {
    // Cash, check and secretary-recorded entries never have one, and a
    // payment-link order is invisible to the exhibitor under RLS. Empty is not
    // an error, and offering a Try again that could never succeed would be a
    // regression against what these cards have always printed.
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    // Both rows and the card total, exactly as before this change.
    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
    expect(screen.getByText('$130.00')).toBeInTheDocument();
    expect(screen.queryByText('Receipt unavailable')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('ignores a stale deep-linked order that did not pay for the card clicked', () => {
    // ?orderId= sticks in the URL after the dialog closes. When the named rows
    // had not replicated the list fell back to SHOW scope, so the next Receipt
    // click is on a different card — and resolving the URL's order against it
    // would dead-end on a message that blames replication.
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [{ ...receiptOrders[0], id: 'order-other', entryIds: ['entry-from-another-card'] }],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />,
      // The order arrives in the URL, exactly as My Payments' Receipt link
      // sends it. Driving it as a prop would leave the URL-to-dialog seam —
      // the one line that makes the deep link work — untested.
      { initialRoute: '/exhibitor/entries?orderId=order-other' }
    );

    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.getByText('$130.00')).toBeInTheDocument();
    expect(screen.queryByText('order-other')).not.toBeInTheDocument();
  });

  it('shows the refund and the net rather than reporting a refunded order as Paid', () => {
    // orderSnapshot.ts: a PARTIALLY refunded order keeps status 'succeeded', so
    // a status-only reading prints "Paid" over money that came back.
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [{ ...receiptOrders[0], status: 'succeeded', refundedCents: 2000 }],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />,
      // The order arrives in the URL, exactly as My Payments' Receipt link
      // sends it. Driving it as a prop would leave the URL-to-dialog seam —
      // the one line that makes the deep link work — untested.
      { initialRoute: '/exhibitor/entries?orderId=order-1' }
    );

    expect(screen.getByText('Partially refunded')).toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
    expect(screen.getByText('-$20.00')).toBeInTheDocument();
    expect(screen.getByText('Net paid')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  it('sends the URL order id into the exact keyed lookup', () => {
    // The seam that makes the deep link work. Asserting the rendered receipt is
    // NOT enough: with a single mocked order the discovery path auto-picks the
    // same one, so a broken URL read produces an identical screen. Only the
    // query argument distinguishes an exact keyed fetch from a card-wide scan.
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [receiptOrders[0]],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />,
      { initialRoute: '/exhibitor/entries?orderId=order-1' }
    );

    expect(useEntryReceiptOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({ requestedOrderId: 'order-1' })
    );
  });

  it('asks for discovery, not an exact order, when the URL carries none', () => {
    useEntryReceiptOrdersMock.mockReturnValue({
      data: [receiptOrders[0]],
      isPending: false,
      isError: false,
      refetch,
    });

    render(
      <ReceiptEntryDialog
        dialog={{ open: true, entry: splitRegistration }}
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(useEntryReceiptOrdersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedOrderId: null,
        // Discovery needs the card's own class ids; passing [] here would
        // disable the query and strand every non-deep-linked receipt.
        entryIds: ['entry-a', 'entry-b'],
      })
    );
  });
});
