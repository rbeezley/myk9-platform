import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { MyPayment } from '@/features/payments/useMyPayments';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';

const state: { data: MyPayment[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
// `data` is deliberately optional. A React Query gated by `enabled` reports
// isLoading:false / isError:false / data:undefined, and typing this as a
// non-optional EntryBalanceSummary made that state literally untypeable —
// which is why the page shipped a false "paid up" for it.
const balanceState: {
  data: EntryBalanceSummary | undefined;
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
vi.mock('@/features/payments/useMyPayments', () => ({
  useMyPayments: () => state,
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
  entryIds: ['e1'],
  refunds: [],
};

describe('ExhibitorPaymentsPage', () => {
  beforeEach(() => {
    state.data = [payment];
    state.isLoading = false;
    state.isError = false;
    balanceState.data = {
      currentFeesCents: 0,
      amountDueCents: 0,
      onlineDueCents: 0,
      payAtShowDueCents: 0,
      onlineShowBalances: [],
    };
    balanceState.isLoading = false;
    balanceState.isError = false;
  });

  it('renders a payment row with qualified description, amount, status, and receipt link', () => {
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByText('Spring Trial')).toBeInTheDocument();
    expect(screen.getByText('Online entry fees')).toBeInTheDocument();
    // $53.00 appears in the gross/net summary plus the table row.
    expect(screen.getAllByText('$53.00')).toHaveLength(3);
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText('pi_abc123')).not.toBeInTheDocument();
    const receipt = screen.getByRole('link', { name: /receipt for spring trial/i });
    expect(receipt).toHaveAttribute('href', '/exhibitor/entries');
    // Settled orders offer no retry affordance.
    expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
  });

  it('offers a cart-recovery retry link for a failed payment, scoped to its show + entries', () => {
    state.data = [{ ...payment, status: 'failed', showId: 'show-1', entryIds: ['e1', 'e2'] }];
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
    // Assert the totals card itself is absent. "Payment history" is now the
    // heading for the whole history section (the failed attempt is still
    // history and still renders in the table), so its presence no longer
    // distinguishes "has paid totals" from "has rows".
    expect(screen.queryByText('Gross paid')).not.toBeInTheDocument();
    expect(screen.queryByText('Net paid')).not.toBeInTheDocument();
  });

  it('offers the retry link for a cancelled payment too', () => {
    state.data = [{ ...payment, status: 'cancelled', showId: 'show-1', entryIds: ['e1'] }];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByRole('link', { name: /finish payment/i })).toHaveAttribute(
      'href',
      '/cart?showId=show-1&entryIds=e1'
    );
  });

  it('states no receipt is available for a failed order with no show or entries, instead of a bare dash', () => {
    state.data = [{ ...payment, status: 'failed', showId: null, entryIds: [] }];
    render(<ExhibitorPaymentsPage />);
    expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my shows/i })).not.toBeInTheDocument();
    expect(screen.getByText('No receipt available')).toBeInTheDocument();
  });

  it('gives a refund-specific reason instead of a generic "no receipt" for the split-off refund row, while the original charge keeps its receipt link', () => {
    // A legacy fully-refunded order with no itemized `refunds` splits into a
    // charge row (the original payment still legitimately has a receipt) and
    // a separate refund row (which doesn't).
    state.data = [{ ...payment, status: 'refunded', netPaidCents: 0, entryIds: ['e1'] }];
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByRole('link', { name: /receipt for/i })).toBeInTheDocument();
    expect(screen.getByText('No receipt (refunded)')).toBeInTheDocument();
  });

  it('renders a refunded amount as a signed deduction, distinct from a charge', () => {
    state.data = [{ ...payment, status: 'refunded', netPaidCents: 0 }];
    render(<ExhibitorPaymentsPage />);
    // Money clarity: a fully refunded legacy order shows the original charge,
    // its signed refund, and a zero net result.
    expect(screen.getByText('Gross paid')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Net paid')).toBeInTheDocument();
    expect(screen.getAllByText('$53.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-$53.00').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('-$30.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$23.00')).toBeInTheDocument();
  });

  it('separates gross paid, refunds, and net paid in the history summary', () => {
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
    expect(screen.getByText('Gross paid')).toBeInTheDocument();
    expect(screen.getByText('Refunds')).toBeInTheDocument();
    expect(screen.getByText('Net paid')).toBeInTheDocument();
    expect(screen.getAllByText('-$53.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$100.00').length).toBeGreaterThan(0);
    expect(screen.getByText('$153.00')).toBeInTheDocument();
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
    expect(screen.getByText('Payment history')).toBeInTheDocument();
    expect(screen.getByText('1 payment')).toBeInTheDocument();
  });

  it('shows a zero-net history summary when the only order was refunded', () => {
    state.data = [{ ...payment, status: 'refunded', netPaidCents: 0 }];
    render(<ExhibitorPaymentsPage />);
    expect(screen.queryByText('Payment history')).toBeInTheDocument();
    expect(screen.getByText('1 payment, 1 refund')).toBeInTheDocument();
    expect(screen.getByText('Refunded')).toBeInTheDocument();
  });

  it('shows current amount due from the same entry balance summary as My Shows', () => {
    balanceState.data = {
      currentFeesCents: 5500,
      amountDueCents: 5500,
      onlineDueCents: 5500,
      payAtShowDueCents: 0,
      onlineShowBalances: [
        {
          showId: 'show-1',
          showName: 'Spring Trial',
          amountDueCents: 5500,
          onlineDueCents: 5500,
          payAtShowDueCents: 0,
          entryIds: ['e1', 'e2'],
          paymentHref: '/cart?showId=show-1&entryIds=e1%2Ce2',
        },
      ],
    };

    render(<ExhibitorPaymentsPage />);

    expect(screen.getByText('Amount due')).toBeInTheDocument();
    expect(screen.getAllByText('$55.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/matches Current Fees on My Shows/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /finish payment/i })).toHaveAttribute(
      'href',
      '/cart?showId=show-1&entryIds=e1%2Ce2'
    );
  });

  it('labels the single-show payment action with the online amount when pay-at-show money is also due', () => {
    balanceState.data = {
      currentFeesCents: 5500,
      amountDueCents: 5500,
      onlineDueCents: 2500,
      payAtShowDueCents: 3000,
      onlineShowBalances: [
        {
          showId: 'show-1',
          showName: 'Spring Trial',
          amountDueCents: 2500,
          onlineDueCents: 2500,
          payAtShowDueCents: 0,
          entryIds: ['e1'],
          paymentHref: '/cart?showId=show-1&entryIds=e1',
        },
      ],
    };

    render(<ExhibitorPaymentsPage />);

    expect(screen.getByText('Amount due')).toBeInTheDocument();
    expect(screen.getByText('$55.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pay \$25.00 online/i })).toHaveAttribute(
      'href',
      '/cart?showId=show-1&entryIds=e1'
    );
    expect(screen.getByText(/\$30.00 is marked pay at show/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^finish payment$/i })).not.toBeInTheDocument();
  });

  it('lists separate checkout links when multiple shows have online balances', () => {
    balanceState.data = {
      currentFeesCents: 5500,
      amountDueCents: 5500,
      onlineDueCents: 5500,
      payAtShowDueCents: 0,
      onlineShowBalances: [
        {
          showId: 'show-1',
          showName: 'A Trial',
          amountDueCents: 2500,
          onlineDueCents: 2500,
          payAtShowDueCents: 0,
          entryIds: ['e1'],
          paymentHref: '/cart?showId=show-1&entryIds=e1',
        },
        {
          showId: 'show-2',
          showName: 'B Trial',
          amountDueCents: 3000,
          onlineDueCents: 3000,
          payAtShowDueCents: 0,
          entryIds: ['e2'],
          paymentHref: '/cart?showId=show-2&entryIds=e2',
        },
      ],
    };

    render(<ExhibitorPaymentsPage />);

    expect(screen.getByText('A Trial')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pay \$25.00/i })).toHaveAttribute(
      'href',
      '/cart?showId=show-1&entryIds=e1'
    );
    expect(screen.getByRole('link', { name: /pay \$30.00/i })).toHaveAttribute(
      'href',
      '/cart?showId=show-2&entryIds=e2'
    );
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
    expect(screen.getByText(/couldn.t reach your payment history/i)).toBeInTheDocument();
    expect(screen.queryByText(/No payments yet/i)).not.toBeInTheDocument();
  });

  describe('balance states', () => {
    it('never claims "paid up" when the balance is unknown rather than zero', () => {
      // The shape of a React Query disabled by `enabled: user?.id && personId`:
      // settled-looking, but never asked. Claiming $0.00 here told an exhibitor
      // who owed money that they owed nothing.
      balanceState.data = undefined;
      balanceState.isLoading = false;
      balanceState.isError = false;

      render(<ExhibitorPaymentsPage />);

      expect(screen.queryByText('Current entries are paid up.')).not.toBeInTheDocument();
      expect(screen.getByText(/can.t show your balance right now/i)).toBeInTheDocument();
      // No zero drawn as a balance claim. (The history totals card legitimately
      // shows $0.00 for refunds, so scope this to the success-styled figure the
      // paid-up card renders.)
      expect(
        document.querySelector('.text-success.tabular-nums, .tabular-nums.text-success')
      ).toBeNull();
    });

    it('still says "paid up" when the balance is genuinely zero', () => {
      balanceState.data = {
        currentFeesCents: 0,
        amountDueCents: 0,
        onlineDueCents: 0,
        payAtShowDueCents: 0,
        onlineShowBalances: [],
      };

      render(<ExhibitorPaymentsPage />);

      expect(screen.getByText('Current entries are paid up.')).toBeInTheDocument();
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });

    it('announces the balance skeleton to assistive tech while loading', () => {
      balanceState.isLoading = true;
      render(<ExhibitorPaymentsPage />);
      expect(screen.getByRole('status', { name: /loading your current balance/i })).toBeVisible();
      expect(screen.queryByText('Current entries are paid up.')).not.toBeInTheDocument();
    });

    it('names the show in the single-show amount-due case', () => {
      balanceState.data = {
        currentFeesCents: 5500,
        amountDueCents: 5500,
        onlineDueCents: 5500,
        payAtShowDueCents: 0,
        onlineShowBalances: [
          {
            showId: 'show-1',
            showName: 'Spring Trial',
            onlineDueCents: 5500,
            paymentHref: '/cart?showId=show-1&entryIds=e1',
          },
        ],
      };

      render(<ExhibitorPaymentsPage />);

      expect(screen.getByRole('heading', { name: 'Amount due' })).toBeInTheDocument();
      // The show name must appear alongside the total, not only in the
      // multi-show breakdown, or the common case says what but never what for.
      expect(screen.getAllByText('Spring Trial').length).toBeGreaterThan(0);
      expect(screen.getByRole('link', { name: /finish payment/i })).toBeInTheDocument();
    });

    it('always offers a way to act on a positive balance with no payable breakdown', () => {
      balanceState.data = {
        currentFeesCents: 4000,
        amountDueCents: 4000,
        onlineDueCents: 4000,
        payAtShowDueCents: 0,
        onlineShowBalances: [],
      };

      render(<ExhibitorPaymentsPage />);

      expect(screen.getByText('$40.00')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'My Shows' })).toHaveAttribute(
        'href',
        '/exhibitor/entries'
      );
    });
  });

  describe('in-flight and settled money', () => {
    it('tells the exhibitor a pending order is still moving instead of dead-ending', () => {
      state.data = [{ ...payment, status: 'pending', showId: 'show-1', entryIds: ['e1'] }];

      render(<ExhibitorPaymentsPage />);

      expect(screen.getByText('Processing, check back shortly')).toBeInTheDocument();
      // No retry link: Stripe is still working the order, and a second
      // attempt risks a duplicate charge.
      expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
      expect(screen.queryByText('No receipt available')).not.toBeInTheDocument();
    });

    it('says where the receipt actually lives, in the visible label', () => {
      render(<ExhibitorPaymentsPage />);
      // "Receipt" alone promised a document and delivered an unfiltered list;
      // the qualifier used to exist only in the accessible name.
      expect(screen.getByRole('link', { name: /receipt for spring trial/i })).toHaveTextContent(
        'Receipt in My Shows'
      );
    });

    it('does not render a negative zero when there are no refunds', () => {
      state.data = [{ ...payment, amountCents: 10000, netPaidCents: 10000 }];
      render(<ExhibitorPaymentsPage />);
      expect(screen.getByText('Refunds')).toBeInTheDocument();
      expect(screen.queryByText('-$0.00')).not.toBeInTheDocument();
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });
  });

  it('gives the payment history section a heading of its own', () => {
    render(<ExhibitorPaymentsPage />);
    expect(screen.getByRole('heading', { name: 'Payment history' })).toBeInTheDocument();
  });
});
