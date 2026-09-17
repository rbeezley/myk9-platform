/**
 * MYK9-536 / MYK9-629: a balance the server never confirmed is its own state.
 *
 * `summarizeEntryBalancesFromSource` returns `kind: 'unknown'` when
 * `getUserEntries` served its rows from the replicated per-show snapshot
 * without the authoritative view confirming them — offline, on a timeout, or
 * when the view came back empty against a populated snapshot.
 *
 * WHAT CHANGED, AND WHY THE OLD ASSERTION IS GONE. This file used to assert
 * that a non-zero unconfirmed figure was KEPT with a "showing saved data"
 * caption beside it ("keeps a stale non-zero figure but says it is saved
 * data"). That is the behaviour PR #2301's round-1 P1 was filed against, and it
 * survived into a third strip on the same page in round 2. Richard's decision
 * on 2026-09-17 (MYK9-629, decision (a)) is that money FIGURES and pay links
 * are withheld while the rows are unconfirmed, while receipts stay reachable.
 * The assertion below is the reversed one, not a loosened one.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AmountDueSection } from './AmountDueSection';
import {
  UNKNOWN_ENTRY_BALANCE_SUMMARY,
  type EntryBalanceSummary,
} from '@/features/payments/entryBalanceSummary';

function summary(overrides: Partial<EntryBalanceSummary> = {}): EntryBalanceSummary {
  return {
    kind: 'known',
    currentFeesCents: 0,
    amountDueCents: 0,
    onlineDueCents: 0,
    payAtShowDueCents: 0,
    onlineShowBalances: [],
    ...overrides,
  };
}

describe('AmountDueSection — an unconfirmed balance', () => {
  it('does not claim "paid up" for an unknown balance', () => {
    render(
      <AmountDueSection summary={UNKNOWN_ENTRY_BALANCE_SUMMARY} isLoading={false} isError={false} />
    );

    expect(screen.queryByText('Current entries are paid up.')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByText(/haven't been able to confirm your balance/i)).toBeInTheDocument();
  });

  it('still claims "paid up" for a CONFIRMED zero balance', () => {
    render(<AmountDueSection summary={summary()} isLoading={false} isError={false} />);

    expect(screen.getByText('Current entries are paid up.')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('withholds an unconfirmed non-zero figure and its pay link (decision (a))', () => {
    render(
      <AmountDueSection
        // The shape a surface would see if it tried to keep the figures: the
        // derivation zeroes them, so even a caller that ignored `kind` has no
        // number to print. Both halves are asserted.
        summary={{ ...UNKNOWN_ENTRY_BALANCE_SUMMARY, kind: 'unknown' }}
        isLoading={false}
        isError={false}
      />
    );

    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
    expect(screen.getByText(/haven't been able to confirm your balance/i)).toBeInTheDocument();
  });

  it('shows the figure and the pay link for a confirmed non-zero balance', () => {
    render(
      <AmountDueSection
        summary={summary({ amountDueCents: 3000, currentFeesCents: 6000 })}
        isLoading={false}
        isError={false}
      />
    );

    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(
      screen.queryByText(/haven't been able to confirm your balance/i)
    ).not.toBeInTheDocument();
  });
});
