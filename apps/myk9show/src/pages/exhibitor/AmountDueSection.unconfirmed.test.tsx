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
  summarizeEntryBalancesFromSource,
  UNKNOWN_ENTRY_BALANCE_SUMMARY,
  type EntryBalanceSource,
  type EntryBalanceSummary,
} from '@/features/payments/entryBalanceSummary';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

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

// MYK9-629 round 1: every case above hands the component a summary OBJECT, so
// none of them exercises the early return in `summarizeEntryBalancesFromSource`
// — deleting that line left them all green. These drive the REAL derivation
// over REAL rows, which is the only shape that can fail when the gate is gone.
describe('AmountDueSection driven through the real derivation', () => {
  const owingRow = (): EntryBalanceSource => ({
    id: 'entry-1',
    showId: 'show-1',
    showName: 'Heartland Classic',
    // Far future, so the balance is never reclassified as past-show debt.
    showDate: new Date('2099-10-10T00:00:00'),
    showEndDate: new Date('2099-10-11T00:00:00'),
    entryCloseDay: '2099-10-01',
    showTimezone: 'America/Chicago',
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: null,
    totalFee: 30,
    classes: [{ id: 'entry-1' }],
  });

  it.each(['replica-offline', 'replica-after-error'] as const)(
    'shows no figure and no pay link when the rows came from %s',
    source => {
      render(
        <AmountDueSection
          summary={summarizeEntryBalancesFromSource([owingRow()], source)}
          isLoading={false}
          isError={false}
        />
      );

      expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /finish payment/i })).not.toBeInTheDocument();
      expect(screen.getByText(/haven't been able to confirm your balance/i)).toBeInTheDocument();
    }
  );

  it('states the same $30 and offers the cart once the view CONFIRMS the rows', () => {
    // The positive control: without it the two cases above would pass on a
    // fixture that simply owed nothing.
    render(
      <AmountDueSection
        summary={summarizeEntryBalancesFromSource([owingRow()], 'confirmed')}
        isLoading={false}
        isError={false}
      />
    );

    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /finish payment/i })).toBeInTheDocument();
  });
});
