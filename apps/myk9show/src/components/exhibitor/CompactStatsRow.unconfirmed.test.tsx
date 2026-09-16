/**
 * MYK9-563 item 2: the My Shows fee strip must not state an unconfirmed
 * balance as fact.
 *
 * `getUserEntries` serves the per-show replication snapshot with `error: null`
 * when the authoritative view fails, times out, or comes back empty against a
 * populated snapshot. My Payments has said so since MYK9-536
 * (`AmountDueSection.stale.test.tsx`); this strip is the SAME money on the
 * other page and said nothing — so an exhibitor with a phantom debt saw it
 * hedged on one surface and asserted on the other.
 *
 * The zero case is the dangerous one, exactly as on My Payments: an
 * offline-empty read produces `amountDue: 0`, which fell straight through to
 * the green "Paid in full".
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { CompactStatsRow } from './CompactStatsRow';

describe('CompactStatsRow — an unconfirmed balance', () => {
  it('does not claim "Paid in full" when a zero balance is unconfirmed', () => {
    render(<CompactStatsRow currentFees={0} amountDue={0} unconfirmed onNavigate={vi.fn()} />);

    expect(screen.queryByText('Paid in full')).not.toBeInTheDocument();
    expect(screen.getByText('Balance unavailable')).toBeInTheDocument();
    expect(screen.getByText(/showing saved data/i)).toBeInTheDocument();
    // No money figure at all: at zero there is nothing to hedge, only a claim
    // to withhold.
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('still claims "Paid in full" for a CONFIRMED zero balance', () => {
    render(<CompactStatsRow currentFees={0} amountDue={0} onNavigate={vi.fn()} />);

    expect(screen.getByText('Paid in full')).toBeInTheDocument();
    expect(screen.queryByText(/showing saved data/i)).not.toBeInTheDocument();
  });

  it('keeps an unconfirmed non-zero figure but says it is saved data', () => {
    render(<CompactStatsRow currentFees={60} amountDue={30} unconfirmed onNavigate={vi.fn()} />);

    // The figure is the best the exhibitor has and they still need it; what
    // changes is its standing.
    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.getByText(/showing saved data/i)).toBeInTheDocument();
  });

  it('says nothing about saved data for a confirmed non-zero figure', () => {
    render(<CompactStatsRow currentFees={60} amountDue={30} onNavigate={vi.fn()} />);

    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.queryByText(/showing saved data/i)).not.toBeInTheDocument();
  });
});
