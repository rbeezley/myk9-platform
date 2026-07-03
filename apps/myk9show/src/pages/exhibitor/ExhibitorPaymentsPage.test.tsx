import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { MyPayment } from '@/features/payments/useMyPayments';

const state: { data: MyPayment[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
vi.mock('@/features/payments/useMyPayments', () => ({
  useMyPayments: () => state,
}));

import ExhibitorPaymentsPage from './ExhibitorPaymentsPage';

const payment: MyPayment = {
  id: 'o1',
  date: '2026-06-10T00:00:00Z',
  showId: 'show-1',
  showName: 'Spring Trial',
  amountCents: 5300,
  netPaidCents: 5300,
  currency: 'usd',
  status: 'succeeded',
  reference: 'pi_abc123',
  entryIds: ['e1'],
  refunds: [],
};

describe('ExhibitorPaymentsPage', () => {
  beforeEach(() => {
    state.data = [payment];
    state.isLoading = false;
    state.isError = false;
  });

  it('renders a payment row with qualified description, amount, status, and receipt link', () => {
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('Online entry fees')).toBeInTheDocument();
    // $53.00 now appears twice — once in the summary card, once in the table row.
    expect(screen.getAllByText('$53.00')).toHaveLength(2);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText('pi_abc123')).not.toBeInTheDocument();
    const receipt = screen.getByRole('link', { name: /receipt for spring trial/i });
    expect(receipt).toHaveAttribute('href', '/exhibitor/entries');
    // Settled orders offer no retry affordance.
    expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
  });

  it('offers a cart-recovery retry link for a failed payment, scoped to its show + entries', () => {
    state.data = [
      { ...payment, status: 'failed', showId: 'show-1', entryIds: ['e1', 'e2'] },
    ];
    render(<ExhibitorPaymentsPage />);
    const retry = screen.getByRole('link', { name: /finish payment/i });
    expect(retry).toHaveAttribute('href', '/cart?showId=show-1&entryIds=e1%2Ce2');
    // The retry replaces the receipt link for unsettled orders.
    expect(screen.queryByRole('link', { name: /my shows/i })).not.toBeInTheDocument();
  });

  it('does not count visible failed payments as paid in the summary', () => {
    state.data = [{ ...payment, status: 'failed', showId: 'show-1', entryIds: ['e1'] }];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByRole('link', { name: /finish payment/i })).toBeInTheDocument();
    expect(screen.queryByText('Total paid')).not.toBeInTheDocument();
  });

  it('offers the retry link for a cancelled payment too', () => {
    state.data = [{ ...payment, status: 'cancelled', showId: 'show-1', entryIds: ['e1'] }];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByRole('link', { name: /finish payment/i })).toHaveAttribute(
      'href',
      '/cart?showId=show-1&entryIds=e1'
    );
  });

  it('falls back to a plain dash for a failed order with no show or entries', () => {
    state.data = [{ ...payment, status: 'failed', showId: null, entryIds: [] }];
    render(<ExhibitorPaymentsPage />);
    expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my shows/i })).not.toBeInTheDocument();
  });

  it('renders a refunded amount as a signed deduction, distinct from a charge', () => {
    state.data = [{ ...payment, status: 'refunded', netPaidCents: 0 }];
    render(<ExhibitorPaymentsPage />);
    // Money-clarity bar: a refund must not read identically to a $53 charge.
    expect(screen.getByText('-$53.00')).toBeInTheDocument();
    expect(screen.queryByText('$53.00')).not.toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  it('renders entry refunds as their own rows and totals the visible net paid amount', () => {
    state.data = [
      {
        ...payment,
        netPaidCents: 2300,
        refunds: [
          {
            entryId: 'e1',
            amountCents: 3000,
            date: '2026-06-12T00:00:00Z',
            label: 'Copper - Advanced A',
          },
        ],
      },
    ];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText('Online entry fees')).toBeInTheDocument();
    expect(screen.getByText('Refund - Copper - Advanced A')).toBeInTheDocument();
    expect(screen.getByText('-$30.00')).toBeInTheDocument();
    expect(screen.getByText('$23.00')).toBeInTheDocument();
  });

  it('subtracts visible legacy refund rows from the Total paid summary', () => {
    state.data = [
      { ...payment, id: 'paid-order', amountCents: 10000, netPaidCents: 10000 },
      {
        ...payment,
        id: 'legacy-refund',
        amountCents: 5300,
        netPaidCents: 0,
        status: 'refunded',
      },
    ];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText('-$53.00')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$47.00')).toBeInTheDocument();
  });

  it('labels failed and pending statuses humanely (no raw lowercase tokens)', () => {
    state.data = [
      { ...payment, id: 'f1', status: 'failed' },
      { ...payment, id: 'p1', status: 'pending' },
    ];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
  });

  it('formats the date unambiguously with a month name', () => {
    // Derive the expected string the same way the component does so the
    // assertion is timezone-independent (CI may run in any TZ).
    const expected = new Date(payment.date as string).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    expect(expected).toMatch(/2026/);
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('gives the receipt link a distinguishable accessible name per show', () => {
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByRole('link', { name: /receipt for spring trial/i })).toBeInTheDocument();
  });

  it('shows a summary header with total paid and the payment count', () => {
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText('Total paid')).toBeInTheDocument();
    expect(screen.getByText('1 payment')).toBeInTheDocument();
  });

  it('omits the summary header when the only order was refunded', () => {
    state.data = [{ ...payment, status: 'refunded', netPaidCents: 0 }];
    render(<ExhibitorPaymentsPage />);
    // Refunded orders contribute no spend, so no summary card renders…
    expect(screen.queryByText('Total paid')).not.toBeInTheDocument();
    // …but the order still appears in the table.
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  it('shows the empty state when there are no payments', () => {
    state.data = [];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText(/No payments yet/i)).toBeInTheDocument();
  });

  it('shows an error state (not the empty state) when the query fails', () => {
    state.data = [];
    state.isError = true;
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText(/couldn.t load your payments/i)).toBeInTheDocument();
    expect(screen.queryByText(/No payments yet/i)).not.toBeInTheDocument();
  });
});
