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
    const receipt = screen.getByRole('link', { name: /my shows/i });
    expect(receipt).toHaveAttribute('href', '/exhibitor/entries');
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
