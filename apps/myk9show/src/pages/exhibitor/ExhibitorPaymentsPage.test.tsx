import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import type { MyPayment } from '@/features/payments/useMyPayments';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';

const state: {
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
const paymentYearsState: { data: string[] | undefined } = { data: undefined };
vi.mock('@/features/payments/useMyPayments', () => ({
  useMyPayments: () => state,
  useMyPaymentYears: () => paymentYearsState,
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

describe('ExhibitorPaymentsPage', () => {
  beforeEach(() => {
    state.data = [payment];
    state.isLoading = false;
    state.isError = false;
    state.isFetching = false;
    state.refetch = vi.fn();
    paymentYearsState.data = undefined;
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
    expect(receipt).toHaveAttribute('href', '/exhibitor/entries?showId=show-1&entryIds=e1');
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
          entryCloseDay: null,
          showTimezone: 'America/New_York',
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
          entryCloseDay: null,
          showTimezone: 'America/New_York',
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
          entryCloseDay: null,
          showTimezone: 'America/New_York',
          amountDueCents: 2500,
          onlineDueCents: 2500,
          payAtShowDueCents: 0,
          entryIds: ['e1'],
          paymentHref: '/cart?showId=show-1&entryIds=e1',
        },
        {
          showId: 'show-2',
          showName: 'B Trial',
          entryCloseDay: null,
          showTimezone: 'America/New_York',
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

  // The amount-due card answers "how much"; these cover the "by when" half.
  // Fake timers pin "today" so the copy is the same in every timezone and on
  // every future run — the deadline text is year-sensitive by design.
  describe('entry-close deadline', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 8, 1, 12, 0, 0));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('names the entry-close date beside the show on a single-show balance', () => {
      balanceState.data = {
        currentFeesCents: 5500,
        amountDueCents: 5500,
        onlineDueCents: 5500,
        payAtShowDueCents: 0,
        onlineShowBalances: [
          {
            showId: 'show-1',
            showName: 'Spring Trial',
            entryCloseDay: '2026-09-14',
            showTimezone: 'America/New_York',
            amountDueCents: 5500,
            onlineDueCents: 5500,
            payAtShowDueCents: 0,
            entryIds: ['e1'],
            paymentHref: '/cart?showId=show-1&entryIds=e1',
          },
        ],
      };

      render(<ExhibitorPaymentsPage />);

      expect(screen.getByText('Spring Trial - pay by Sep 14')).toBeInTheDocument();
    });

    it('names the entry-close date in the qualified single-show line when other money is also due', () => {
      balanceState.data = {
        currentFeesCents: 5500,
        amountDueCents: 5500,
        onlineDueCents: 2500,
        payAtShowDueCents: 3000,
        onlineShowBalances: [
          {
            showId: 'show-1',
            showName: 'Spring Trial',
            entryCloseDay: '2026-09-14',
            showTimezone: 'America/New_York',
            amountDueCents: 2500,
            onlineDueCents: 2500,
            payAtShowDueCents: 0,
            entryIds: ['e1'],
            paymentHref: '/cart?showId=show-1&entryIds=e1',
          },
        ],
      };

      render(<ExhibitorPaymentsPage />);

      expect(
        screen.getByText('$25.00 of this is for Spring Trial - pay by Sep 14')
      ).toBeInTheDocument();
    });

    it('names each show its own entry-close date in the multi-show breakdown', () => {
      balanceState.data = {
        currentFeesCents: 5500,
        amountDueCents: 5500,
        onlineDueCents: 5500,
        payAtShowDueCents: 0,
        onlineShowBalances: [
          {
            showId: 'show-1',
            showName: 'A Trial',
            entryCloseDay: '2026-09-14',
            showTimezone: 'America/New_York',
            amountDueCents: 2500,
            onlineDueCents: 2500,
            payAtShowDueCents: 0,
            entryIds: ['e1'],
            paymentHref: '/cart?showId=show-1&entryIds=e1',
          },
          {
            showId: 'show-2',
            showName: 'B Trial',
            entryCloseDay: '2026-10-02',
            showTimezone: 'America/New_York',
            amountDueCents: 3000,
            onlineDueCents: 3000,
            payAtShowDueCents: 0,
            entryIds: ['e2'],
            paymentHref: '/cart?showId=show-2&entryIds=e2',
          },
        ],
      };

      render(<ExhibitorPaymentsPage />);

      expect(screen.getByText('A Trial - pay by Sep 14')).toBeInTheDocument();
      expect(screen.getByText('B Trial - pay by Oct 2')).toBeInTheDocument();
    });

    it('shows the bare show name when the close date is unknown or already past', () => {
      balanceState.data = {
        currentFeesCents: 5500,
        amountDueCents: 5500,
        onlineDueCents: 5500,
        payAtShowDueCents: 0,
        onlineShowBalances: [
          {
            showId: 'show-1',
            showName: 'A Trial',
            entryCloseDay: null,
            showTimezone: 'America/New_York',
            amountDueCents: 2500,
            onlineDueCents: 2500,
            payAtShowDueCents: 0,
            entryIds: ['e1'],
            paymentHref: '/cart?showId=show-1&entryIds=e1',
          },
          {
            showId: 'show-2',
            showName: 'B Trial',
            entryCloseDay: '2026-08-20',
            showTimezone: 'America/New_York',
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
      // Closed on Aug 20, rendered on Sep 1: state no deadline rather than an
      // overdue-looking one the app cannot back up.
      expect(screen.getByText('B Trial')).toBeInTheDocument();
      expect(screen.queryByText(/pay by/i)).not.toBeInTheDocument();
    });

    it('drops the deadline once the show timezone rolls past it on a tab left open', async () => {
      // The page never refetches on window focus, so a `now` frozen at mount
      // would keep promising a deadline that has since lapsed.
      vi.setSystemTime(new Date('2026-09-14T20:00:00Z')); // 4pm Sep 14, Eastern
      balanceState.data = {
        currentFeesCents: 5500,
        amountDueCents: 5500,
        onlineDueCents: 5500,
        payAtShowDueCents: 0,
        onlineShowBalances: [
          {
            showId: 'show-1',
            showName: 'Spring Trial',
            entryCloseDay: '2026-09-14',
            showTimezone: 'America/New_York',
            amountDueCents: 5500,
            onlineDueCents: 5500,
            payAtShowDueCents: 0,
            entryIds: ['e1'],
            paymentHref: '/cart?showId=show-1&entryIds=e1',
          },
        ],
      };

      render(<ExhibitorPaymentsPage />);
      expect(screen.getByText('Spring Trial - pay by Sep 14')).toBeInTheDocument();

      // Nine hours later it is 1am Sep 15 in New York: entries have closed.
      await act(async () => {
        vi.advanceTimersByTime(9 * 60 * 60 * 1000);
      });

      // "Spring Trial" also names the row in the payment history below.
      expect(screen.getAllByText('Spring Trial').length).toBeGreaterThan(0);
      expect(screen.queryByText(/pay by/i)).not.toBeInTheDocument();
    });
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
    expect(screen.getByText(/couldn.t load your payment history/i)).toBeInTheDocument();
    expect(screen.queryByText(/No payments yet/i)).not.toBeInTheDocument();
  });

  it('offers a retry on a failed load, and does not guess why it failed', async () => {
    state.data = [];
    state.isError = true;
    render(<ExhibitorPaymentsPage />);

    const retry = screen.getByRole('button', { name: /try again/i });
    await userEvent.click(retry);
    expect(state.refetch).toHaveBeenCalled();

    // useMyPayments throws on any query failure, so the copy must not blame
    // connectivity or promise a recovery it cannot deliver.
    expect(screen.queryByText(/back online/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/refresh/i)).not.toBeInTheDocument();
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
            entryCloseDay: null,
            showTimezone: 'America/New_York',
            amountDueCents: 5500,
            onlineDueCents: 5500,
            payAtShowDueCents: 0,
            entryIds: ['e1'],
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

    it('does not attribute a mixed balance to the single online show', () => {
      // $55 owed online for Spring Trial, plus $30 marked pay at show that may
      // belong to a different show entirely. The headline figure is the $85
      // aggregate, so naming Spring Trial bare underneath it would claim the
      // whole total is that show's.
      // No payment rows, so the only "Spring Trial" that could match is the
      // one in the balance card rather than a history table cell.
      state.data = [];
      balanceState.data = {
        currentFeesCents: 8500,
        amountDueCents: 8500,
        onlineDueCents: 5500,
        payAtShowDueCents: 3000,
        onlineShowBalances: [
          {
            showId: 'show-1',
            showName: 'Spring Trial',
            entryCloseDay: null,
            showTimezone: 'America/New_York',
            amountDueCents: 5500,
            onlineDueCents: 5500,
            payAtShowDueCents: 0,
            entryIds: ['e1'],
            paymentHref: '/cart?showId=show-1&entryIds=e1',
          },
        ],
      };

      render(<ExhibitorPaymentsPage />);

      expect(screen.getByText('$85.00')).toBeInTheDocument();
      expect(screen.getByText(/\$55\.00 of this is for/)).toBeInTheDocument();
      // The bare name must not stand alone under the aggregate.
      expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument();
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

    it('scopes the receipt link to the entries the order actually covered', () => {
      state.data = [{ ...payment, showId: 'show-1', entryIds: ['e1', 'e2'] }];
      render(<ExhibitorPaymentsPage />);

      const link = screen.getByRole('link', { name: /receipt for spring trial/i });
      // Mirrors buildFinishPaymentHref's shape: My Shows reads both params and
      // narrows to this order instead of listing every entry ever made.
      expect(link).toHaveAttribute('href', '/exhibitor/entries?showId=show-1&entryIds=e1%2Ce2');
      // The label can be a bare "Receipt" again now that it is honest.
      expect(link).toHaveTextContent('Receipt');
      expect(link).not.toHaveTextContent('Receipt in My Shows');
      // The accessible name still names the show, so tabbing the column can
      // still tell one row's receipt from another's.
      expect(link).toHaveAccessibleName('Receipt for Spring Trial in My Shows');
    });

    it('falls back to an entry-only scope when the order carries no show id', () => {
      state.data = [{ ...payment, showId: null, showName: null, entryIds: ['e1'] }];
      render(<ExhibitorPaymentsPage />);

      expect(screen.getByRole('link', { name: /receipt for this payment/i })).toHaveAttribute(
        'href',
        '/exhibitor/entries?entryIds=e1'
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

  describe('year filter', () => {
    // Mid-year, midday UTC on purpose: these dates must land in the same
    // calendar year under every US timezone the suite might run in, so the
    // assertions are about the filter and not about a New Year's Eve edge.
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
      state.data = bothYears;
      const { user } = render(<ExhibitorPaymentsPage />);

      await user.click(screen.getByRole('combobox', { name: /filter payment history by year/i }));
      const options = await screen.findAllByRole('option');
      expect(options.map(o => o.textContent)).toEqual(['All time', '2026', '2025']);
    });

    it('shows every year by default, so no payment is hidden on arrival', () => {
      state.data = bothYears;
      render(<ExhibitorPaymentsPage />);
      expect(screen.getByText('Spring Trial')).toBeInTheDocument();
      expect(screen.getByText('Autumn Trial')).toBeInTheDocument();
    });

    it('scopes the list and the totals card to a year chosen from the control', async () => {
      state.data = bothYears;
      const { user } = render(<ExhibitorPaymentsPage />);

      await user.click(screen.getByRole('combobox', { name: /filter payment history by year/i }));
      await user.click(await screen.findByRole('option', { name: '2025' }));

      await waitFor(() => expect(screen.queryByText('Spring Trial')).not.toBeInTheDocument());
      expect(screen.getByText('Autumn Trial')).toBeInTheDocument();
      // The totals card re-totals the visible rows, and says which year it
      // is talking about — an unlabelled total under a filter is a money
      // claim about a period the exhibitor never named.
      expect(screen.getByText('1 payment in 2025')).toBeInTheDocument();
      expect(screen.getAllByText('$20.00').length).toBeGreaterThan(0);
      expect(screen.queryByText('$53.00')).not.toBeInTheDocument();
    });

    it('honors ?year= on arrival so a shared or refreshed link keeps the view', () => {
      state.data = bothYears;
      render(<ExhibitorPaymentsPage />, { initialRoute: '/exhibitor/payments?year=2026' });
      expect(screen.getByText('Spring Trial')).toBeInTheDocument();
      expect(screen.queryByText('Autumn Trial')).not.toBeInTheDocument();
      expect(screen.getByText('1 payment in 2026')).toBeInTheDocument();
    });

    it('retains known year options so the exhibitor can switch directly between years', async () => {
      state.data = [payment];
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
      // A stale link must not render an empty ledger — on a money surface
      // that reads as "you paid nothing", not "that year is empty".
      state.data = bothYears;
      render(<ExhibitorPaymentsPage />, { initialRoute: '/exhibitor/payments?year=2019' });
      expect(screen.getByText('Spring Trial')).toBeInTheDocument();
      expect(screen.getByText('Autumn Trial')).toBeInTheDocument();
      expect(screen.queryByText(/in 2019/)).not.toBeInTheDocument();
    });

    it('leaves the totals card unscoped when showing all time', () => {
      state.data = bothYears;
      render(<ExhibitorPaymentsPage />);
      expect(screen.getByText('2 payments')).toBeInTheDocument();
    });

    it('keeps the control reachable when a valid ?year= hides undated rows', () => {
      // One year plus an undated row is still two buckets — only All time
      // shows the undated one. Hiding the control here stranded the exhibitor
      // on a filtered ledger with no way back (stripe_orders.created_at is
      // DEFAULT NOW(), not NOT NULL, so an undated row is possible).
      state.data = [
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
      // Cash basis across a year boundary. The totals card clamped net at zero,
      // so $53 that demonstrably came back in 2026 read as "Net paid $0.00".
      state.data = [
        {
          ...payment,
          date: '2025-12-20T12:00:00Z',
          status: 'refunded',
          refundedAt: '2026-01-08T12:00:00Z',
          refunds: [],
        },
      ];
      render(<ExhibitorPaymentsPage />, { initialRoute: '/exhibitor/payments?year=2026' });

      // Three occurrences: the Refunds figure, the Net paid figure, and the
      // table row. Clamped, Net paid read "$0.00" and there were only two —
      // so the count is what actually pins the fix.
      expect(screen.getAllByText('-$53.00')).toHaveLength(3);
      // Gross paid is legitimately $0.00 for this year: the charge was 2025.
      expect(screen.getByText('Gross paid')).toBeInTheDocument();
      // (getAllBy: the Amount due card above renders $0.00 too.)
      expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    });
  });
});
