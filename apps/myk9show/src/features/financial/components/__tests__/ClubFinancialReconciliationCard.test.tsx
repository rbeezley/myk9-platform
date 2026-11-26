import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ClubFinancialReconciliationCard } from '../ClubFinancialReconciliationCard';
import * as reconciliationModule from '../../useClubFinancialReconciliation';
import * as figuresModule from '@/features/payments/useClubShowPayoutFigures';
import * as schedulesModule from '@/features/payments/useShowPayoutSchedules';
import type { ClubShowPayoutFigures } from '@/features/payments/clubShowPayoutFigures';
import {
  payoutFigures,
  payoutFiguresWith,
} from '@/features/payments/clubShowPayoutFiguresFixtures';
import type { ClubShowReconciliationRow } from '../../clubShowReconciliation';
import { resolvePayoutSettlement } from '../../payoutSettlement';

vi.mock('../../useClubFinancialReconciliation', () => ({
  useClubFinancialReconciliation: vi.fn(),
}));

vi.mock('@/features/payments/useClubShowPayoutFigures', () => ({
  useClubShowPayoutFigures: vi.fn(),
}));

vi.mock('@/features/payments/useShowPayoutSchedules', () => ({
  useShowPayoutSchedules: vi.fn(),
}));

const mockedReconciliation = vi.mocked(reconciliationModule.useClubFinancialReconciliation);
const mockedFigures = vi.mocked(figuresModule.useClubShowPayoutFigures);
const mockedSchedules = vi.mocked(schedulesModule.useShowPayoutSchedules);

// Cedar Valley Classic ends Wed Dec 9 2026 (New York); paid by Wed Dec 16.
const CEDAR_SCHEDULE = new Map([
  ['show-1', { lastDay: '2026-12-09', timeZone: 'America/New_York' }],
]);

/** Every online fee refunded: the server owes nothing. */
const ALL_REFUNDED = { refunded_cents: 5000, owed_cents: 0 };
const CLUB_FAILURE = 'club_account:account_closed: The bank account is closed';

type FiguresResult = ReturnType<typeof figuresModule.useClubShowPayoutFigures>;

function mockFigures(
  rows: ClubShowPayoutFigures[],
  state: { isLoading?: boolean; isError?: boolean; refetch?: () => void } = {}
) {
  mockedFigures.mockReturnValue({
    data: state.isLoading || state.isError ? undefined : rows,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch: state.refetch ?? vi.fn(),
  } as unknown as FiguresResult);
}

/** The non-money facts the reconciliation read adds: coverage and the transfer id. */
function reconciliationRow(
  overrides: Partial<ClubShowReconciliationRow> = {}
): ClubShowReconciliationRow {
  return {
    showId: 'show-1',
    showName: 'Cedar Valley Classic',
    chargeVerification: 'AllFeeBreakdowns',
    settlement: resolvePayoutSettlement(
      {
        payoutId: 'payout-1',
        status: 'completed',
        amountCents: 5000,
        stripeTransferId: 'tr_123',
        failureReason: null,
        completedAt: '2026-12-12T15:00:00Z',
        createdAt: '2026-12-12T08:00:00Z',
      },
      'enabled'
    ),
    orderCount: 1,
    ...overrides,
  };
}

function mockReconciliation(
  rows: ClubShowReconciliationRow[] = [reconciliationRow()],
  state: { isLoading?: boolean; isError?: boolean; refetch?: () => void } = {}
) {
  mockedReconciliation.mockReturnValue({
    rows,
    isLoading: state.isLoading ?? false,
    isError: state.isError ?? false,
    refetch: state.refetch ?? vi.fn(),
  });
}

function renderCard(props: Partial<Parameters<typeof ClubFinancialReconciliationCard>[0]> = {}) {
  return render(
    <ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" {...props} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedSchedules.mockReturnValue(CEDAR_SCHEDULE);
  mockReconciliation();
  mockFigures([]);
  // Two days after the show, before the promised date.
  vi.useFakeTimers({ now: new Date('2026-12-11T15:00:00Z'), toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ClubFinancialReconciliationCard: loading and failure', () => {
  it('figures loading: a skeleton, no figure and no payout sentence', () => {
    mockFigures([], { isLoading: true });
    renderCard();

    expect(screen.queryByTestId('payout-stage')).not.toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('reconciliation-unavailable')).not.toBeInTheDocument();
    expect(screen.queryByText(/no shows to reconcile yet/i)).not.toBeInTheDocument();
  });

  it('reconciliation loading: a skeleton, not a false coverage state', () => {
    mockFigures([payoutFigures()]);
    mockReconciliation([], { isLoading: true });
    renderCard();

    expect(screen.queryByTestId('payout-stage')).not.toBeInTheDocument();
    expect(screen.queryByText(/fee breakdown/i)).not.toBeInTheDocument();
  });

  it('figures failed: the unavailable line, never $0 or "nothing owed"', async () => {
    const refetchFigures = vi.fn();
    const refetchReconciliation = vi.fn();
    mockFigures([], { isError: true, refetch: refetchFigures });
    mockReconciliation([reconciliationRow()], { refetch: refetchReconciliation });
    vi.useRealTimers();
    const user = userEvent.setup();
    renderCard();

    expect(screen.getByTestId('reconciliation-unavailable')).toHaveTextContent(
      "We can't load this reconciliation right now. That's a problem displaying the figures, not a sign that anything happened to your payouts."
    );
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nothing to send/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no shows to reconcile yet/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('payout-stage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('payout-figures')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetchFigures).toHaveBeenCalledTimes(1);
    expect(refetchReconciliation).toHaveBeenCalledTimes(1);
  });

  it('reconciliation failed: the unavailable state and never a coverage badge (INTENT gate)', () => {
    mockFigures([payoutFiguresWith('completed')]);
    mockReconciliation([], { isError: true });
    renderCard();

    expect(screen.getByTestId('reconciliation-unavailable')).toBeInTheDocument();
    expect(
      screen.getByText(/not a sign that anything happened to your payouts/i)
    ).toBeInTheDocument();
    // MYK9-231: `isError` cannot know which hop failed, so the copy names none.
    expect(screen.queryByText(/against Stripe/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fee breakdown/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Mismatch')).not.toBeInTheDocument();
    expect(screen.queryByText(/Paid/)).not.toBeInTheDocument();
  });

  it('empty: calm explanatory copy, no error styling', () => {
    renderCard();
    expect(screen.getByText(/no shows to reconcile yet/i)).toBeInTheDocument();
  });
});

describe('ClubFinancialReconciliationCard: the server figures', () => {
  it('Collected, Refunded and Paid, each separate, as the server computed them', () => {
    mockFigures([
      payoutFiguresWith('completed', {
        collected_cents: 128000,
        refunded_cents: 3200,
        owed_cents: 124800,
        payout_amount_cents: 124800,
      }),
    ]);
    renderCard();

    expect(screen.getByText('Cedar Valley Classic')).toBeInTheDocument();
    expect(screen.getByTestId('payout-figures')).toHaveTextContent(
      'Collected $1,280.00 · Refunded $32.00 · Paid $1,248.00'
    );
    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Sent December 12. Usually in your account the next business day.'
    );
  });

  it('a sent row keeps its coverage badge and copyable transfer id, and no Stripe link', () => {
    mockFigures([payoutFiguresWith('completed')]);
    renderCard();

    expect(screen.getByText('Stripe fee breakdown for every charge')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy stripe transfer id tr_123/i })
    ).toBeInTheDocument();
    // MYK9-1985: the platform's dashboard, which a club cannot sign in to, is not linked.
    expect(screen.queryByRole('link', { name: /stripe/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href*="dashboard.stripe.com"]')).toBeNull();
  });

  it('the sent day is machine-readable, on the show calendar', () => {
    mockFigures([payoutFiguresWith('completed')]);
    renderCard();

    const when = screen.getByText('December 12');
    expect(when.tagName).toBe('TIME');
    expect(when.getAttribute('datetime')).toBe('2026-12-12T15:00:00Z');
  });

  it("an unsent show's figure is the live owed amount, never the parked row's stored one", () => {
    // $10.00 refunded after the row was parked at $50.00: the run will send $40.00.
    mockFigures([
      payoutFiguresWith('awaiting_approval', {
        refunded_cents: 1000,
        owed_cents: 4000,
        payout_amount_cents: 5000,
      }),
    ]);
    renderCard();

    const figures = screen.getByTestId('payout-figures');
    expect(figures).toHaveTextContent(
      'Collected $50.00 · Refunded $10.00 · To transfer $40.00 awaiting transfer, not yet sent'
    );
    expect(figures).not.toHaveTextContent('Paid');
  });

  it('a transfer in flight reads "Being sent", never Paid', () => {
    mockFigures([payoutFiguresWith('processing')]);
    renderCard();

    expect(screen.getByTestId('payout-figures')).toHaveTextContent(
      'Collected $50.00 · Refunded $0.00 · Being sent $50.00'
    );
    expect(screen.getByTestId('payout-figures')).not.toHaveTextContent('Paid');
  });

  it('a transfer id is shown only beside the payout row it belongs to', () => {
    mockFigures([payoutFiguresWith('completed', { payout_id: 'payout-2' })]);
    renderCard();

    expect(
      screen.queryByRole('button', { name: /copy stripe transfer id/i })
    ).not.toBeInTheDocument();
  });

  it('a show the reconciliation read has no orders for says No Stripe charges', () => {
    mockFigures([payoutFigures()]);
    mockReconciliation([]);
    renderCard();

    expect(screen.getByText('No Stripe charges')).toBeInTheDocument();
  });
});

describe('ClubFinancialReconciliationCard: the payout sentence', () => {
  it.each([
    ['awaiting_approval', 'Being checked by myK9Show. Paid by December 16.'],
    ['approved', 'Being checked by myK9Show. Paid by December 16.'],
    ['held', 'Being checked by myK9Show. Paid by December 16.'],
    ['processing', 'Being sent now. Paid by December 16.'],
    ['pending', 'Paid by December 16.'],
  ])('a %s payout reads "%s"', (status, sentence) => {
    mockFigures([payoutFiguresWith(status)]);
    renderCard();

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(sentence);
  });

  it('before the show ends: paid within five business days of the last day', () => {
    vi.setSystemTime(new Date('2026-12-08T15:00:00Z'));
    mockFigures([payoutFigures()]);
    renderCard();

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Paid within five business days of December 9.'
    );
  });

  it('past the promised date: delayed, never a past date', () => {
    vi.setSystemTime(new Date('2026-12-17T15:00:00Z'));
    mockFigures([payoutFiguresWith('awaiting_approval')]);
    renderCard();

    const line = screen.getByTestId('payout-stage');
    expect(line).toHaveTextContent(
      "Your payout is taking longer than usual. We'll be in touch by email."
    );
    expect(line).not.toHaveTextContent(/December/);
  });

  it('a show with no readable dates states the promise in words', () => {
    mockedSchedules.mockReturnValue(new Map());
    mockFigures([payoutFigures()]);
    renderCard();

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "Paid within five business days of the show's last day."
    );
  });

  it('no payout row yet: a deadline, no transfer id', () => {
    mockFigures([payoutFigures()]);
    renderCard();

    expect(screen.getByTestId('payout-stage')).toHaveTextContent('Paid by December 16.');
    expect(
      screen.queryByRole('button', { name: /copy stripe transfer id/i })
    ).not.toBeInTheDocument();
  });

  it('a fully refunded show has nothing to send and never reads Paid', () => {
    mockFigures([payoutFigures(ALL_REFUNDED)]);
    renderCard();

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Nothing to send. Every entry fee for this show was refunded.'
    );
    expect(screen.getByTestId('payout-figures')).toHaveTextContent(
      /^Collected \$50\.00 · Refunded \$50\.00$/
    );
    expect(screen.queryByText(/Paid/)).not.toBeInTheDocument();
  });

  it('a $0 completed close-out row is nothing to send, never "Sent" or "Paid $0.00"', () => {
    mockFigures([payoutFiguresWith('completed', { ...ALL_REFUNDED, payout_amount_cents: 0 })]);
    renderCard();

    const line = screen.getByTestId('payout-stage');
    expect(line).toHaveTextContent('Nothing to send. Every entry fee for this show was refunded.');
    expect(line).not.toHaveTextContent(/Sent/);
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
    expect(screen.getByTestId('payout-figures')).not.toHaveTextContent(/Paid|To transfer/);
  });

  it('Codex (a): a known $0 owed with no refunds and no payout row promises no payment', () => {
    mockFigures([payoutFigures({ collected_cents: 0, owed_cents: 0 })]);
    renderCard({ accountState: 'not-enabled', onConnectBankAccount: vi.fn() });

    const line = screen.getByTestId('payout-stage');
    expect(line).toHaveTextContent(
      'Nothing to send. This show has no online entry fees to pay out.'
    );
    expect(line).not.toHaveTextContent(/Paid by|refunded/);
    expect(screen.queryByRole('button', { name: 'Connect bank account' })).not.toBeInTheDocument();
    expect(screen.getByTestId('payout-figures')).toHaveTextContent(
      /^Collected \$0\.00 · Refunded \$0\.00$/
    );
  });

  it('Codex (b): a club-account failure whose fees were then refunded: no Fix it, no "To transfer"', () => {
    mockFigures([
      payoutFiguresWith('failed', { ...ALL_REFUNDED, payout_failure_reason: CLUB_FAILURE }),
    ]);
    renderCard({ onFixBankAccount: vi.fn() });

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      'Nothing to send. Every entry fee for this show was refunded.'
    );
    expect(screen.queryByText(/bank account needs attention/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fix it' })).not.toBeInTheDocument();
    expect(screen.getByTestId('payout-figures')).toHaveTextContent(
      /^Collected \$50\.00 · Refunded \$50\.00$/
    );
  });

  it.each(['pending', 'awaiting_approval', 'approved', 'held'])(
    'Codex (c): a %s row still holding $50.00 after a full refund: no deadline, no "To transfer"',
    status => {
      mockFigures([payoutFiguresWith(status, { ...ALL_REFUNDED, payout_amount_cents: 5000 })]);
      renderCard();

      const line = screen.getByTestId('payout-stage');
      expect(line).toHaveTextContent(
        'Nothing to send. Every entry fee for this show was refunded.'
      );
      expect(line).not.toHaveTextContent(/Paid by|Being checked/);
      expect(screen.getByTestId('payout-figures')).toHaveTextContent(
        /^Collected \$50\.00 · Refunded \$50\.00$/
      );
    }
  );

  it('a platform failure says we are on it, with no control for the club', () => {
    mockFigures([payoutFiguresWith('failed', { payout_failure_reason: 'Stripe rate limit' })]);
    renderCard({ onFixBankAccount: vi.fn(), onConnectBankAccount: vi.fn() });

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "We couldn't send this. We're on it, and you don't need to do anything. Paid by December 16."
    );
    expect(screen.queryByRole('button', { name: /fix it/i })).not.toBeInTheDocument();
  });

  it('a club failure names the bank account, and Fix it opens the fix', async () => {
    const onFixBankAccount = vi.fn();
    mockFigures([payoutFiguresWith('failed', { payout_failure_reason: CLUB_FAILURE })]);
    vi.useRealTimers();
    const user = userEvent.setup();
    renderCard({ onFixBankAccount });

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "Your bank account needs attention. We can't send this payout until it's fixed."
    );
    await user.click(screen.getByRole('button', { name: 'Fix it' }));
    expect(onFixBankAccount).toHaveBeenCalledTimes(1);
  });

  it('bank not connected: waiting for the bank account, with the link that connects it', async () => {
    const onConnectBankAccount = vi.fn();
    mockFigures([payoutFigures()]);
    vi.useRealTimers();
    const user = userEvent.setup();
    renderCard({ accountState: 'not-enabled', onConnectBankAccount });

    expect(screen.getByTestId('payout-stage')).toHaveTextContent(
      "Waiting for your club's bank account."
    );
    await user.click(screen.getByRole('button', { name: 'Connect bank account' }));
    expect(onConnectBankAccount).toHaveBeenCalledTimes(1);
  });

  // MYK9-2172: a held payout never shows the operator's reason, a failure, or "Paid".
  it.each(['awaiting_approval', 'approved', 'held'])(
    'a %s payout never reads failed or late, and is not Paid',
    status => {
      mockFigures([payoutFiguresWith(status, { payout_failure_reason: 'operator note' })]);
      renderCard();

      expect(screen.getByTestId('payout-figures')).toHaveTextContent('To transfer $50.00');
      expect(screen.getByTestId('payout-figures')).not.toHaveTextContent('Paid');
      for (const alarm of [/needs attention/i, /failed/i, /late/i, /overdue/i, /operator note/i]) {
        expect(screen.queryByText(alarm)).not.toBeInTheDocument();
      }
    }
  );
});

describe('ClubFinancialReconciliationCard: charge coverage', () => {
  it('SomeFeeBreakdownsMissing: the partial-coverage badge, not the full one', () => {
    mockFigures([payoutFigures()]);
    mockReconciliation([reconciliationRow({ chargeVerification: 'SomeFeeBreakdownsMissing' })]);
    renderCard();

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
    mockFigures([payoutFigures()]);
    for (const state of ['AllFeeBreakdowns', 'SomeFeeBreakdownsMissing'] as const) {
      mockReconciliation([reconciliationRow({ chargeVerification: state })]);
      const view = renderCard();
      expect(screen.getByText(LABELS[state])).toBeInTheDocument();
      expect(screen.queryByText('Mismatch')).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
