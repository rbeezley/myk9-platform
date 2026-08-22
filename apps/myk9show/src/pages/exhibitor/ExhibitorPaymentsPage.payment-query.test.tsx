import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';
import type { MyPayment } from '@/features/payments/useMyPayments';
import { render } from '@/test/utils/testUtils';

const paymentState: {
  data: MyPayment[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
} = {
  data: [],
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};

const paymentYearsState: {
  data: string[] | undefined;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
} = {
  data: undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};

const balanceState: {
  data: EntryBalanceSummary;
  isLoading: boolean;
  isError: boolean;
} = {
  data: {
    currentFeesCents: 0,
    amountDueCents: 0,
    onlineDueCents: 0,
    payAtShowDueCents: 0,
    onlineShowBalances: [],
  },
  isLoading: false,
  isError: false,
};

const { useMyPaymentsMock, useMyPaymentYearsMock } = vi.hoisted(() => ({
  useMyPaymentsMock: vi.fn(),
  useMyPaymentYearsMock: vi.fn(),
}));

vi.mock('@/features/payments/useMyPayments', () => ({
  useMyPayments: useMyPaymentsMock,
  useMyPaymentYears: useMyPaymentYearsMock,
}));
vi.mock('@/features/payments/useMyEntryBalanceSummary', () => ({
  useMyEntryBalanceSummary: () => balanceState,
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
  refundedAt: null,
  entryIds: ['e1'],
  refunds: [],
};

describe('ExhibitorPaymentsPage payment queries', () => {
  beforeEach(() => {
    paymentState.data = [payment];
    paymentState.isLoading = false;
    paymentState.isError = false;
    paymentState.isFetching = false;
    paymentState.refetch = vi.fn();
    paymentYearsState.data = undefined;
    paymentYearsState.isError = false;
    paymentYearsState.isFetching = false;
    paymentYearsState.refetch = vi.fn();
    useMyPaymentsMock.mockReset().mockImplementation((_selection?: string) => paymentState);
    useMyPaymentYearsMock.mockReset().mockImplementation((_enabled: boolean) => paymentYearsState);
  });

  it('shows an error state instead of an empty ledger when the payment query fails', () => {
    paymentState.data = [];
    paymentState.isError = true;
    render(<ExhibitorPaymentsPage />);

    expect(screen.getByText(/couldn.t load your payment history/i)).toBeInTheDocument();
    expect(screen.queryByText(/No payments yet/i)).not.toBeInTheDocument();
  });

  it('retries only the enabled payment query and does not guess why it failed', async () => {
    paymentState.data = [];
    paymentState.isError = true;
    render(<ExhibitorPaymentsPage />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(paymentState.refetch).toHaveBeenCalledOnce();
    expect(paymentYearsState.refetch).not.toHaveBeenCalled();
    expect(screen.queryByText(/back online/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/refresh/i)).not.toBeInTheDocument();
  });

  it('surfaces a selected-year metadata failure and retries both payment queries', async () => {
    paymentYearsState.isError = true;
    render(<ExhibitorPaymentsPage />, {
      initialRoute: '/exhibitor/payments?year=2026',
    });

    expect(screen.getByText(/couldn.t load your payment history/i)).toBeInTheDocument();
    expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(paymentState.refetch).toHaveBeenCalledOnce();
    expect(paymentYearsState.refetch).toHaveBeenCalledOnce();
  });

  describe('year filter', () => {
    const olderPayment: MyPayment = {
      ...payment,
      id: 'o0',
      date: '2025-05-02T12:00:00Z',
      showName: 'Autumn Trial',
      amountCents: 2000,
      netPaidCents: 2000,
      entryIds: ['e9'],
    };
    const bothYears = [payment, olderPayment];

    it('offers no control when every payment is in the same year', () => {
      render(<ExhibitorPaymentsPage />);
      expect(
        screen.queryByRole('combobox', { name: /filter payment history by year/i })
      ).not.toBeInTheDocument();
    });

    it('offers the years the exhibitor actually has, newest first, plus all time', async () => {
      paymentState.data = bothYears;
      const { user } = render(<ExhibitorPaymentsPage />);

      await user.click(screen.getByRole('combobox', { name: /filter payment history by year/i }));
      const options = await screen.findAllByRole('option');
      expect(options.map(option => option.textContent)).toEqual(['All time', '2026', '2025']);
    });

    it('shows every year by default, so no payment is hidden on arrival', () => {
      paymentState.data = bothYears;
      render(<ExhibitorPaymentsPage />);

      expect(screen.getByText('Spring Trial')).toBeInTheDocument();
      expect(screen.getByText('Autumn Trial')).toBeInTheDocument();
      expect(useMyPaymentsMock).toHaveBeenCalledWith('all');
      expect(useMyPaymentYearsMock).toHaveBeenCalledWith(false);
    });

    it('scopes the list and totals to a year chosen from the control', async () => {
      paymentState.data = bothYears;
      const { user } = render(<ExhibitorPaymentsPage />);

      await user.click(screen.getByRole('combobox', { name: /filter payment history by year/i }));
      await user.click(await screen.findByRole('option', { name: '2025' }));

      await waitFor(() => expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument());
      expect(screen.getByText('Autumn Trial')).toBeInTheDocument();
      expect(screen.getByText('1 payment in 2025')).toBeInTheDocument();
      expect(screen.getAllByText('$20.00').length).toBeGreaterThan(0);
      expect(screen.queryByText('$53.00')).not.toBeInTheDocument();
      expect(useMyPaymentsMock).toHaveBeenLastCalledWith('2025');
      expect(useMyPaymentYearsMock).toHaveBeenLastCalledWith(true);
    });

    it('honors a valid URL year and sends it to the server query', () => {
      paymentState.data = bothYears;
      render(<ExhibitorPaymentsPage />, { initialRoute: '/exhibitor/payments?year=2026' });

      expect(screen.getByText('Spring Trial')).toBeInTheDocument();
      expect(screen.queryByText('Autumn Trial')).not.toBeInTheDocument();
      expect(screen.getByText('1 payment in 2026')).toBeInTheDocument();
      expect(useMyPaymentsMock).toHaveBeenCalledWith('2026');
      expect(useMyPaymentYearsMock).toHaveBeenCalledWith(true);
    });

    it('retains known year options so the exhibitor can switch directly between years', async () => {
      paymentYearsState.data = ['2026', '2025'];
      const { user } = render(<ExhibitorPaymentsPage />, {
        initialRoute: '/exhibitor/payments?year=2026',
      });

      const picker = screen.getByRole('combobox', { name: /filter payment history by year/i });
      await user.click(picker);
      await user.click(await screen.findByRole('option', { name: '2025' }));
      expect(picker).toHaveTextContent('2025');

      await user.click(picker);
      await user.click(await screen.findByRole('option', { name: '2026' }));
      expect(picker).toHaveTextContent('2026');
    });

    it('falls back to all time for a year the exhibitor has no payments in', () => {
      paymentState.data = bothYears;
      render(<ExhibitorPaymentsPage />, { initialRoute: '/exhibitor/payments?year=2019' });

      expect(screen.getByText('Spring Trial')).toBeInTheDocument();
      expect(screen.getByText('Autumn Trial')).toBeInTheDocument();
      expect(screen.queryByText(/in 2019/)).not.toBeInTheDocument();
    });

    it('leaves the totals card unscoped when showing all time', () => {
      paymentState.data = bothYears;
      render(<ExhibitorPaymentsPage />);
      expect(screen.getByText('2 payments')).toBeInTheDocument();
    });

    it('keeps the control reachable when a valid URL year hides undated rows', () => {
      paymentState.data = [
        payment,
        { ...payment, id: 'o-undated', date: null, showName: 'Undated Trial' },
      ];
      render(<ExhibitorPaymentsPage />, { initialRoute: '/exhibitor/payments?year=2026' });

      expect(screen.queryByText('Undated Trial')).not.toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: /filter payment history by year/i })
      ).toBeInTheDocument();
    });

    it('reports a negative net for a year holding only a refund of an earlier charge', () => {
      paymentState.data = [
        {
          ...payment,
          date: '2025-12-20T12:00:00Z',
          status: 'refunded',
          refundedAt: '2026-01-08T12:00:00Z',
          refunds: [],
        },
      ];
      render(<ExhibitorPaymentsPage />, { initialRoute: '/exhibitor/payments?year=2026' });

      expect(screen.getAllByText('-$53.00')).toHaveLength(3);
      expect(screen.getByText('Gross paid')).toBeInTheDocument();
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });
  });
});
