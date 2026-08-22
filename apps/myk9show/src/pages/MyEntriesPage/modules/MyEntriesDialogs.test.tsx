import { screen } from '@testing-library/react';
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

const receiptOrders = [
  {
    id: 'order-1',
    amountCents: 6500,
    currency: 'usd',
    reference: 'pi_order_1',
    status: 'succeeded',
    entryIds: ['entry-a'],
  },
  {
    id: 'order-2',
    amountCents: 7500,
    currency: 'usd',
    reference: 'pi_order_2',
    status: 'succeeded',
    entryIds: ['entry-b'],
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
        receiptOrderId={null}
        user={{ email: 'handler@example.com' }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /receipt for order order-1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /receipt for order order-2/i })).toBeInTheDocument();
    expect(screen.queryByText('Amount charged')).not.toBeInTheDocument();
    expect(screen.queryByText('$65.00')).not.toBeInTheDocument();
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
        receiptOrderId={null}
        user={{ email: 'handler@example.com' }}
        onClose={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /receipt for order order-1/i }));

    expect(screen.getByText('Novice')).toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
    expect(screen.getByText('$65.00')).toBeInTheDocument();
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
        receiptOrderId={null}
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Entry Receipt')).toBeInTheDocument();
    expect(screen.getByText('$65.00')).toBeInTheDocument();
    expect(screen.queryByText('Choose a receipt')).not.toBeInTheDocument();
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
        receiptOrderId="order-1"
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Receipt entries still loading')).toBeInTheDocument();
    expect(screen.queryByText('$140.00')).not.toBeInTheDocument();
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
        receiptOrderId="order-1"
        user={null}
        onClose={vi.fn()}
      />
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
        receiptOrderId={null}
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
        receiptOrderId={null}
        user={null}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Receipt unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
