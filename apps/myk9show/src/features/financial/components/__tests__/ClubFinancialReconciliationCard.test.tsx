import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClubFinancialReconciliationCard } from '../ClubFinancialReconciliationCard';
import * as reconciliationModule from '../../useClubFinancialReconciliation';
import type { ClubShowReconciliationRow } from '../../clubShowReconciliation';

vi.mock('../../useClubFinancialReconciliation', () => ({
  useClubFinancialReconciliation: vi.fn(),
}));

const mockedHook = vi.mocked(reconciliationModule.useClubFinancialReconciliation);

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
      amountCents: 9680, // $96.80 actually transferred — intentionally != net
      stripeTransferId: 'tr_123',
      completedAt: '2026-07-05T00:00:00Z',
      createdAt: '2026-07-04T00:00:00Z',
    },
    orderCount: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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

  it('FeeBreakdown + settled row: shows net, Stripe-record badge, Paid badge, copyable id, and Stripe link', () => {
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
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy stripe transfer id tr_123/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /view transfer tr_123 in stripe/i })
    ).toBeInTheDocument();
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

  it('carries the payout date across from the list this card replaced', () => {
    // The ONE field the merged row did not already hold. A treasurer reconciles
    // against a bank statement; a money row with no date ties to nothing.
    mockedHook.mockReturnValue({
      rows: [
        row({
          settlement: {
            payoutId: 'payout-1',
            badgeLabel: 'Paid',
            state: 'settled',
            amountCents: 9680,
            stripeTransferId: 'tr_123',
            completedAt: '2026-07-05T00:00:00Z',
            createdAt: '2026-07-04T00:00:00Z',
          },
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    const when = screen.getByText(/Paid on/);
    expect(when).toHaveTextContent(new Date('2026-07-05T00:00:00Z').toLocaleDateString());
    // Machine-readable, which the old list never was.
    expect(when.querySelector('time')?.getAttribute('datetime')).toBe('2026-07-05T00:00:00Z');
  });

  it('an unsettled payout is dated by when it STARTED, not by a settlement that has not happened', () => {
    mockedHook.mockReturnValue({
      rows: [
        row({
          settlement: {
            payoutId: 'payout-2',
            badgeLabel: 'Scheduled',
            state: 'in_progress',
            amountCents: 5000,
            stripeTransferId: null,
            completedAt: null,
            createdAt: '2026-07-04T00:00:00Z',
          },
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.getByText(/Started on/)).toBeInTheDocument();
    expect(screen.queryByText(/Paid on/)).not.toBeInTheDocument();
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

  it('no payout row yet: no settlement badge, no transfer id, no Stripe link', () => {
    mockedHook.mockReturnValue({
      rows: [row({ settlement: null })],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    expect(screen.queryByText('Paid')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /view transfer/i })).not.toBeInTheDocument();
  });

  it('a payout needing attention renders the destructive settlement badge', () => {
    mockedHook.mockReturnValue({
      rows: [
        row({
          settlement: {
            payoutId: 'payout-2',
            badgeLabel: 'Needs attention',
            state: 'attention',
            amountCents: 5000,
            stripeTransferId: null,
            completedAt: '2026-07-05T00:00:00Z',
            createdAt: '2026-07-04T00:00:00Z',
          },
        }),
      ],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<ClubFinancialReconciliationCard clubId="club-1" accountState="enabled" />);

    // The destructive variant keeps its own colours; it must NOT pick up the
    // neutral chip that every other settlement state now carries.
    const badge = screen.getByText('Needs attention');
    expect(badge.className).toContain('destructive');
    expect(badge.className).not.toContain('chip-stone');
  });
});
