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
  currency: 'usd',
  status: 'succeeded',
  reference: 'pi_abc123',
  entryIds: ['e1'],
};

describe('ExhibitorPaymentsPage', () => {
  beforeEach(() => {
    state.data = [payment];
    state.isLoading = false;
    state.isError = false;
  });

  it('renders a payment row with show, amount, status, reference, receipt link', () => {
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('$53.00')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('pi_abc123')).toBeInTheDocument();
    const receipt = screen.getByRole('link', { name: /find the receipt/i });
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
    state.data = [{ ...payment, status: 'refunded' }];
    render(<ExhibitorPaymentsPage />);
    // Money-clarity bar: a refund must not read identically to a $53 charge.
    expect(screen.getByText('-$53.00')).toBeInTheDocument();
    expect(screen.queryByText('$53.00')).not.toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
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
    expect(
      screen.getByRole('link', { name: /find the receipt for spring trial/i })
    ).toBeInTheDocument();
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
