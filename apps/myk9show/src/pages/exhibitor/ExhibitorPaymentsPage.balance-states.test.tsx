import { act, screen } from '@testing-library/react';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';
import { render } from '@/test/utils/testUtils';

const paymentState = {
  data: [],
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};

const paymentYearsState = {
  data: undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
};

const balanceState: {
  data: EntryBalanceSummary | undefined;
  isLoading: boolean;
  isError: boolean;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
};

vi.mock('@/features/payments/useMyPayments', () => ({
  useMyPayments: () => paymentState,
  useMyPaymentYears: () => paymentYearsState,
}));
vi.mock('@/features/payments/useMyEntryBalanceSummary', () => ({
  useMyEntryBalanceSummary: () => balanceState,
}));

import ExhibitorPaymentsPage from './ExhibitorPaymentsPage';

describe('ExhibitorPaymentsPage balance states', () => {
  beforeEach(() => {
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

  it('never claims "paid up" when the balance is unknown rather than zero', () => {
    balanceState.data = undefined;

    render(<ExhibitorPaymentsPage />);

    expect(screen.queryByText('Current entries are paid up.')).not.toBeInTheDocument();
    expect(screen.getByText(/can.t show your balance right now/i)).toBeInTheDocument();
    expect(
      document.querySelector('.text-success.tabular-nums, .tabular-nums.text-success')
    ).toBeNull();
  });

  it('still says "paid up" when the balance is genuinely zero', () => {
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
    expect(screen.getAllByText('Spring Trial').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /finish payment/i })).toBeInTheDocument();
  });

  it('does not attribute a mixed balance to the single online show', () => {
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
      expect(screen.getByText('B Trial')).toBeInTheDocument();
      expect(screen.queryByText(/pay by/i)).not.toBeInTheDocument();
    });

    it('drops the deadline once the show timezone rolls past it on a tab left open', async () => {
      vi.setSystemTime(new Date('2026-09-14T20:00:00Z'));
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

      await act(async () => {
        vi.advanceTimersByTime(9 * 60 * 60 * 1000);
      });

      expect(screen.getByText('Spring Trial')).toBeInTheDocument();
      expect(screen.queryByText(/pay by/i)).not.toBeInTheDocument();
    });
  });
});
