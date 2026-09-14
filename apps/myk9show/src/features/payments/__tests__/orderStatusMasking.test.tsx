import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  type EntryBalanceRawRow,
} from '../entryBalanceSummary';
import { AmountDueSection } from '@/pages/exhibitor/AmountDueSection';
import { CompactStatsRow } from '@/components/exhibitor/CompactStatsRow';
import { render } from '@/test/utils/testUtils';

/**
 * MYK9-495 — an order's `paid` status masked an entry that was still `pending`,
 * so $30 of live, payable debt read "Paid in full" on every exhibitor money
 * surface while the cart simultaneously offered to charge it.
 *
 * `enrollments` is keyed (show_id, handler_id) — ONE row per exhibitor per
 * show, reused by every later submission — so its `payment_status` says "some
 * order for this show was paid", never "this entry was paid". These tests pin
 * the rule that fixes it: an entry's own `pending` can never be masked by its
 * order, in either direction.
 */

const NOW = new Date(2026, 8, 13, 12, 0, 0);

const SHOW = {
  id: 'show-heartland',
  name: 'Heartland Scent Work Classic',
  start_date: '2026-11-28',
  end_date: '2026-11-29',
  entry_close_date: '2026-11-24',
};

function row(overrides: Partial<EntryBalanceRawRow> = {}): EntryBalanceRawRow {
  return {
    id: 'entry-juni',
    show_id: SHOW.id,
    entry_status: 'submitted',
    payment_status: 'pending',
    payment_method: 'online',
    entry_fee: 30,
    show: SHOW,
    registration: { payment_status: 'paid' },
    ...overrides,
  };
}

function summarize(rows: EntryBalanceRawRow[]) {
  return summarizeEntryBalances(rows.map(mapEntryRowToBalanceSource), NOW);
}

describe('order payment status never masks an entry balance (MYK9-495)', () => {
  it('reports the unpaid remainder of a partially paid order', () => {
    const summary = summarize([row()]);

    expect(summary.amountDueCents).toBe(3000);
    expect(summary.onlineDueCents).toBe(3000);
    expect(summary.onlineShowBalances).toHaveLength(1);
    expect(summary.onlineShowBalances[0].showId).toBe(SHOW.id);
  });

  it('counts only the pending entry of a mixed order', () => {
    const summary = summarize([
      row({ id: 'paid-1', payment_status: 'paid' }),
      row({ id: 'paid-2', payment_status: 'paid' }),
      row({ id: 'pending-1' }),
    ]);

    expect(summary.currentFeesCents).toBe(9000);
    expect(summary.amountDueCents).toBe(3000);
  });

  it('stays at zero for a fully paid order', () => {
    expect(summarize([row({ payment_status: 'paid' })]).amountDueCents).toBe(0);
  });

  it('stays at zero for a waived entry under a paid order', () => {
    expect(summarize([row({ payment_status: 'waived' })]).amountDueCents).toBe(0);
  });

  it('stays at zero for a refunded entry under a paid order', () => {
    expect(summarize([row({ payment_status: 'refunded' })]).amountDueCents).toBe(0);
  });

  it('keeps an order-level pending visible when the entry row reads paid', () => {
    const summary = summarize([
      row({ payment_status: 'paid', registration: { payment_status: 'pending' } }),
    ]);

    expect(summary.amountDueCents).toBe(3000);
  });

  it('falls back to the order status when the entry carries none', () => {
    expect(summarize([row({ payment_status: null })]).amountDueCents).toBe(0);
    expect(
      summarize([row({ payment_status: null, registration: { payment_status: 'pending' } })])
        .amountDueCents
    ).toBe(3000);
  });

  it('keeps past-show debt owed but unpayable online', () => {
    const summary = summarize([
      row({
        show: { ...SHOW, start_date: '2026-08-01', end_date: '2026-08-02' },
      }),
    ]);

    expect(summary.amountDueCents).toBe(3000);
    expect(summary.currentFeesCents).toBe(0);
    expect(summary.onlineShowBalances[0].isPastShow).toBe(true);
  });
});

describe('the exhibitor money surfaces agree on the unmasked balance (MYK9-495)', () => {
  const summary = () => summarize([row()]);

  it('My Payments shows the amount due and a reachable recovery action', () => {
    render(<AmountDueSection summary={summary()} isLoading={false} isError={false} />);

    expect(screen.getByText('$30.00')).toBeInTheDocument();
    expect(screen.queryByText('Current entries are paid up.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Finish payment/i })).toBeInTheDocument();
  });

  it('the My Shows fee card does not claim paid in full', () => {
    const s = summary();
    render(
      <CompactStatsRow
        currentFees={s.currentFeesCents / 100}
        amountDue={s.amountDueCents / 100}
        currentFeesHref={s.onlineShowBalances[0].paymentHref}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.queryByText('Paid in full')).not.toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();
  });
});
