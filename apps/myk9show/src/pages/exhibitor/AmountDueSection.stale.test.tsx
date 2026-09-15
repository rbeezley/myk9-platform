/**
 * MYK9-536: a balance the server never confirmed is its own state.
 *
 * `useMyEntryBalanceSummary` marks a summary `stale` when `getUserEntries`
 * served it from the replicated per-show snapshot without the authoritative
 * view confirming those rows — offline, on a timeout, or when the view came
 * back empty against a populated snapshot.
 *
 * The zero case is the dangerous one. An offline-empty read produces a summary
 * of all zeros, which fell straight through to the green "$0.00 / Current
 * entries are paid up." card — the same false reassurance the `!summary` branch
 * above it exists to prevent, arriving by a different route. "We could not ask"
 * is not "you owe nothing".
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AmountDueSection } from './AmountDueSection';
import type { EntryBalanceSummary } from '@/features/payments/entryBalanceSummary';

function summary(overrides: Partial<EntryBalanceSummary> = {}): EntryBalanceSummary {
  return {
    currentFeesCents: 0,
    amountDueCents: 0,
    onlineDueCents: 0,
    payAtShowDueCents: 0,
    onlineShowBalances: [],
    ...overrides,
  };
}

describe('AmountDueSection — an unconfirmed balance', () => {
  it('does not claim "paid up" when a zero balance is stale', () => {
    render(
      <AmountDueSection summary={summary({ stale: true })} isLoading={false} isError={false} />
    );

    expect(screen.queryByText('Current entries are paid up.')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByText(/can't show your balance right now/i)).toBeInTheDocument();
  });

  it('still claims "paid up" for a CONFIRMED zero balance', () => {
    render(<AmountDueSection summary={summary()} isLoading={false} isError={false} />);

    expect(screen.getByText('Current entries are paid up.')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('keeps a stale non-zero figure but says it is saved data', () => {
    render(
      <AmountDueSection
        summary={summary({
          stale: true,
          amountDueCents: 3000,
          currentFeesCents: 6000,
        })}
        isLoading={false}
        isError={false}
      />
    );

    // The figure is the best available and the exhibitor still needs it; what
    // changes is its standing.
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText(/showing saved data/i)).toBeInTheDocument();
  });

  it('says nothing about saved data for a confirmed non-zero figure', () => {
    render(
      <AmountDueSection
        summary={summary({ amountDueCents: 3000, currentFeesCents: 6000 })}
        isLoading={false}
        isError={false}
      />
    );

    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.queryByText(/showing saved data/i)).not.toBeInTheDocument();
  });
});
