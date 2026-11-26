import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClubFinancialReconciliationCard } from '../ClubFinancialReconciliationCard';
import * as reconciliationModule from '../../useClubFinancialReconciliation';
import * as schedulesModule from '@/features/payments/useShowPayoutSchedules';
import type { ClubShowReconciliationRow } from '../../clubShowReconciliation';
import { resolvePayoutSettlement } from '../../payoutSettlement';

vi.mock('../../useClubFinancialReconciliation', () => ({
  useClubFinancialReconciliation: vi.fn(),
}));

vi.mock('@/features/payments/useShowPayoutSchedules', () => ({
  useShowPayoutSchedules: vi.fn(),
}));

const mockedHook = vi.mocked(reconciliationModule.useClubFinancialReconciliation);
const mockedSchedules = vi.mocked(schedulesModule.useShowPayoutSchedules);

// Cedar Valley Classic ends Wed Dec 9 2026 (New York); paid by Wed Dec 16.
const CEDAR_SCHEDULE = new Map([
  ['show-1', { lastDay: '2026-12-09', timeZone: 'America/New_York' }],
]);

function settlementFor(
  status: string,
  overrides: Partial<Parameters<typeof resolvePayoutSettlement>[0]> = {}
) {
  return resolvePayoutSettlement(
    {
      payoutId: 'payout-1',
      status,
      amountCents: 5000,
      stripeTransferId: null,
      failureReason: null,
      completedAt: null,
      createdAt: '2026-12-12T08:00:00Z',
      ...overrides,
    },
    'enabled'
  );
}

function row(overrides: Partial<ClubShowReconciliationRow> = {}): ClubShowReconciliationRow {
  return {
    showId: 'show-1',
    showName: 'Cedar Valley Classic',
    net: { status: 'available', netCents: 10000 }, // $100.00 entry-fee take
    chargeVerification: 'AllFeeBreakdowns',
    settlement: {
      payoutId: 'payout-1',
      badgeLabel: 'Paid',
      state: 'settled',
      status: 'completed',
      failureReason: null,
      amountCents: 9680, // $96.80 actually transferred — intentionally != net
      stripeTransferId: 'tr_123',
      completedAt: '2026-12-12T15:00:00Z',
      createdAt: '2026-12-12T08:00:00Z',
    },
    orderCount: 1,
    refundedCents: 0,
    owed: 'some',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSchedules.mockReturnValue(CEDAR_SCHEDULE);
  // Two days after the show, before the promised date.
  vi.useFakeTimers({ now: new Date('2026-12-11T15:00:00Z'), toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ClubFinancialReconciliationCard', () => {
  it('loading: shows a skeleton, not a false verified/unavailable state', () => {
    mockedHook.mockReturnValue({ rows: [], isLoading: true, isError: false, refetch: vi.fn() });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('reconciliation-unavailable')).not.toBeInTheDocument();
  });

  it('unavailable/error: shows an explicit unavailable state and never a verified badge (INTENT gate)', () => {
    mockedHook.mockReturnValue({ rows: [], isLoading: false, isError: true, refetch: vi.fn() });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByTestId('reconciliation-unavailable')).toBeInTheDocument();
    expect(screen.getByText(/can't load this reconciliation right now/i)).toBeInTheDocument();
    // The reassurance is the half that must survive: a failed READ must never
    // read as a failed payout.
    expect(
      screen.getByText(/not a sign that anything happened to your payouts/i)
    ).toBeInTheDocument();
    // MYK9-231: and the half that must not. `isError` is React Query's verdict
    // that the query function threw; it cannot know which hop failed, so the
    // copy may not name one. #1727 threw synchronously in the browser with no
    // request issued, while this card blamed Stripe.
    expect(screen.queryByText(/against Stripe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fee breakdown/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Mismatch')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
  });

  it('empty: calm explanatory copy, no error styling', () => {
    mockedHook.mockReturnValue({ rows: [], isLoading: false, isError: false, refetch: vi.fn() });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByText(/no shows to reconcile yet/i)).toBeInTheDocument();
  });

  it('FeeBreakdown + settled row: shows net, Stripe-record badge, the sent sentence and copyable id', () => {
    mockedHook.mockReturnValue({
      rows: [row()],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByText('Cedar Valley Classic')).toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('Stripe fee breakdown for every charge')).toBeInTheDocument();
    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Sent December 12. Usually in your account the next business day.'
    );
    expect(
      screen.getByRole('button', { name: /copy stripe transfer id tr_123/i })
    ).toBeInTheDocument();
    // MYK9-1985: the platform's dashboard, which a club cannot sign in to, is not linked.
    expect(screen.queryByRole('link', { name: /stripe/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="dashboard.stripe.com"]')).toBeNull();
  });

  it('shows the SETTLED TRANSFER amount, labeled and distinct from the entry-fee net', () => {
    // net (entry-fee take, $100.00) and the actual Stripe transfer amount
    // ($96.80) are intentionally different figures; the reconciliation view
    // shows BOTH so a treasurer can tie the transfer to Stripe.
    mockedHook.mockReturnValue({
      rows: [row()],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    // Entry-fee net present as its own figure...
    expect(screen.getByText('$100.00')).toBeInTheDocument();
    // ...and the settled transfer amount is shown, labeled "Transferred:".
    expect(screen.getByText('Transferred:')).toBeInTheDocument();
    // Assert the rendered line, not an aria-label: Badge and bare <span> map to
    // role="generic", which PROHIBITS naming, so the aria-label this used to
    // check was dropped by every screen reader and the test proved nothing.
    const transferLine = screen.getByText('Transferred:').closest('p');
    expect(transferLine).toHaveTextContent('$96.80');
    // The two figures are textually distinguishable ($100.00 vs $96.80).
    expect(transferLine).not.toHaveTextContent('$100.00');
  });

  it('the sent day is machine-readable, on the show calendar', () => {
    mockedHook.mockReturnValue({
      rows: [row()],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    const when = screen.getByText('December 12');
    expect(when.tagName).toBe('TIME');
    expect(when.getAttribute('datetime')).toBe('2026-12-12T15:00:00Z');
  });

  it.each([
    ['awaiting_approval', 'Being checked by myK9Show. Paid by December 16.'],
    ['approved', 'Being checked by myK9Show. Paid by December 16.'],
    ['held', 'Being checked by myK9Show. Paid by December 16.'],
    ['processing', 'Being sent now. Paid by December 16.'],
    ['pending', 'Paid by December 16.'],
  ])('a %s payout reads "%s"', (status, sentence) => {
    mockedHook.mockReturnValue({
      rows: [row({ settlement: settlementFor(status) })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(sentence);
  });

  it('before the show ends: paid within five business days of the last day', () => {
    vi.setSystemTime(new Date('2026-12-08T15:00:00Z'));
    mockedHook.mockReturnValue({
      rows: [row({ settlement: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Paid within five business days of December 9.'
    );
  });

  it('past the promised date: delayed, never a past date', () => {
    vi.setSystemTime(new Date('2026-12-17T15:00:00Z'));
    mockedHook.mockReturnValue({
      rows: [row({ settlement: settlementFor('awaiting_approval') })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    const line = screen.getByTestId('payout-stage');
    expect(line).toHaveTextContent(
      "Your payout is taking longer than usual. We'll be in touch by email."
    );
    expect(line).not.toHaveTextContent(/December/);
  });

  it('a show with no readable dates states the promise in words', () => {
    mockedSchedules.mockReturnValue(new Map());
    mockedHook.mockReturnValue({
      rows: [row({ settlement: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "Paid within five business days of the show's last day."
    );
  });

  it('a fully refunded show has nothing to send and never reads Paid', () => {
    mockedHook.mockReturnValue({
      rows: [
        row({
          net: { status: 'available', netCents: 0 },
          refundedCents: 10000,
          owed: 'none-refunded',
          settlement: null,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Nothing to send. Every entry fee for this show was refunded.'
    );
    expect(screen.queryByText(/^Paid/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Transferred:/)).not.toBeInTheDocument();
  });

  it('a $0 show with no refund never claims every entry fee was refunded', () => {
    mockedHook.mockReturnValue({
      rows: [
        row({
          net: { status: 'available', netCents: 0 },
          refundedCents: 0,
          owed: 'none-no-fees',
          settlement: null,
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByTestId('payout-stage')).not.toHaveTextContent(/refunded/);
  });

  it('a $0 completed payout row is nothing to send, never "Sent"', () => {
    mockedHook.mockReturnValue({
      rows: [
        row({
          net: { status: 'available', netCents: 0 },
          refundedCents: 10000,
          owed: 'none-refunded',
          settlement: settlementFor('completed', {
            amountCents: 0,
            completedAt: '2026-12-12T15:00:00Z',
          }),
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    const line = screen.getByTestId('payout-stage');
    expect(line).toHaveTextContent('Nothing to send. Every entry fee for this show was refunded.');
    expect(line).not.toHaveTextContent(/Sent/);
    expect(screen.queryByText(/Transferred:|To transfer:/)).not.toBeInTheDocument();
  });

  it('a club-account failure whose fees were then refunded: no Fix it, no stale "To transfer"', () => {
    mockedHook.mockReturnValue({
      rows: [
        row({
          net: { status: 'available', netCents: 0 },
          refundedCents: 5000,
          owed: 'none-refunded',
          settlement: settlementFor('failed', {
            failureReason: 'club_account:account_closed: The bank account is closed',
          }),
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <ClubFinancialReconciliationCard
        clubId="club-1"
        accountState="enabled"
        onFixBankAccount={vi.fn()}
      />
    );

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Nothing to send. Every entry fee for this show was refunded.'
    );
    expect(screen.queryByRole('button', { name: 'Fix it' })).not.toBeInTheDocument();
    expect(screen.queryByText(/To transfer:/)).not.toBeInTheDocument();
    expect(screen.queryByText('$50.00')).not.toBeInTheDocument();
  });

  it('a platform failure says we are on it, with no control for the club', () => {
    mockedHook.mockReturnValue({
      rows: [row({ settlement: settlementFor('failed', { failureReason: 'Stripe rate limit' }) })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(
      <ClubFinancialReconciliationCard
        clubId="club-1"
        accountState="enabled"
        onFixBankAccount={vi.fn()}
        onConnectBankAccount={vi.fn()}
      />
    );

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "We couldn't send this. We're on it, and you don't need to do anything. Paid by December 16."
    );
    expect(screen.queryByRole('button', { name: /fix it/i })).not.toBeInTheDocument();
  });

  it('a club failure names the bank account, and Fix it opens the fix', async () => {
    const onFixBankAccount = vi.fn();
    mockedHook.mockReturnValue({
      rows: [
        row({
          settlement: settlementFor('failed', {
            failureReason: 'club_account:account_closed: The bank account is closed',
          }),
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      <ClubFinancialReconciliationCard
        clubId="club-1"
        accountState="enabled"
        onFixBankAccount={onFixBankAccount}
      />
    );

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "Your bank account needs attention. We can't send this payout until it's fixed."
    );
    await user.click(screen.getByRole('button', { name: 'Fix it' }));
    expect(onFixBankAccount).toHaveBeenCalledTimes(1);
  });

  it('bank not connected: waiting for the bank account, with the link that connects it', async () => {
    const onConnectBankAccount = vi.fn();
    mockedHook.mockReturnValue({
      rows: [row({ settlement: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    vi.useRealTimers();
    const user = userEvent.setup();
    render(
      <ClubFinancialReconciliationCard
        clubId="club-1"
        accountState="not-enabled"
        onConnectBankAccount={onConnectBankAccount}
      />
    );

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "Waiting for your club's bank account."
    );
    await user.click(screen.getByRole('button', { name: 'Connect bank account' }));
    expect(onConnectBankAccount).toHaveBeenCalledTimes(1);
  });

  it('NoFeeBreakdown row: shows the no-Stripe-record badge, not the Stripe-record one', () => {
    mockedHook.mockReturnValue({
      rows: [row({ chargeVerification: 'SomeFeeBreakdownsMissing', settlement: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByText('Some charges have no Stripe fee breakdown')).toBeInTheDocument();
    expect(screen.queryByText('Stripe fee breakdown for every charge')).not.toBeInTheDocument();
    expect(screen.queryByText('Mismatch')).not.toBeInTheDocument();
  });

  // The destructive "Mismatch" badge is GONE: it was driven by an amount tie-out
  // inference that false-reds on rounding residue, legacy rows, partial refunds
  // and desk refunds. The card now only ever says which record is on file.
  it('never renders a Mismatch badge for either remaining state', () => {
    const LABELS = {
      AllFeeBreakdowns: 'Stripe fee breakdown for every charge',
      SomeFeeBreakdownsMissing: 'Some charges have no Stripe fee breakdown',
    } as const;
    for (const state of ['AllFeeBreakdowns', 'SomeFeeBreakdownsMissing'] as const) {
      mockedHook.mockReturnValue({
        rows: [row({ chargeVerification: state })],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      const view = render(
        <ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />
      );
      expect(screen.getByText(LABELS[state])).toBeInTheDocument();
      expect(screen.queryByText('Mismatch')).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('pending net: renders a "Net pending" pill, never $0 or a bare number', () => {
    mockedHook.mockReturnValue({
      rows: [row({ net: { status: 'pending' } })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByText('Net pending')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('no payout row yet: a deadline, no transfer id', () => {
    mockedHook.mockReturnValue({
      rows: [row({ settlement: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByTestId('payout-stage')).toHaveTextContent('Paid by December 16.');
    expect(
      screen.queryByRole('button', { name: /copy stripe transfer id/i })
    ).not.toBeInTheDocument();
  });

  // MYK9-2172: a held payout never shows the operator's reason, a failure, or a "Transferred" figure.
  it.each(['awaiting_approval', 'approved', 'held'])(
    'a %s payout never reads failed or late, and is not "Transferred"',
    status => {
      mockedHook.mockReturnValue({
        rows: [row({ settlement: settlementFor(status, { failureReason: 'operator note' }) })],
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

      expect(screen.getByText(/To transfer:/)).toBeInTheDocument();
      expect(screen.queryByText(/Transferred:/)).not.toBeInTheDocument();
      for (const alarm of [/needs attention/i, /failed/i, /late/i, /overdue/i, /operator note/i]) {
        expect(screen.queryByText(alarm)).not.toBeInTheDocument();
      }
    }
  );
});
