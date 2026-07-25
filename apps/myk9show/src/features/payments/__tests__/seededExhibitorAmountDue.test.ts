/**
 * Task 7.5 follow-up — pins the amount-due figure for the seeded exhibitor's
 * real staging data.
 *
 * The cross-surface Playwright walk found My Shows and My Payments AGREEING on
 * "$0 due / paid up" for an account whose ENTRY rows carry two current,
 * pending, $30 fees. Surface-to-surface agreement cannot catch a shared wrong
 * number, so this test checks the canonical selector against the rows
 * themselves, independent of any rendering.
 *
 * Outcome: $0 is correct. Both pending rows belong to an `enrollments` order
 * that was paid at checkout ($210); per-entry rows are not reconciled after an
 * order-level payment, so they keep a stale `pending` that the order's status
 * overrides. The reading that looks alarming in the raw `entries` table is the
 * expected shape of a paid order.
 *
 * Fixture is verbatim from staging (`Heartland Scent Work Classic`, owner
 * e2e-exhibitor@test.myk9.com) — 15 per-class rows across 5 dogs, spanning
 * paid / pending / refunded / waived payment statuses and confirmed /
 * submitted / paid / promotion-expired / not_accepted / withdrawn entry
 * statuses, with both `online` and unset payment methods.
 */
import { describe, it, expect } from 'vitest';
import {
  mapEntryRowToBalanceSource,
  summarizeEntryBalances,
  isCurrentSummaryEntry,
  type EntryBalanceRawRow,
} from '../entryBalanceSummary';

/** Show opens 2026-08-01; "now" is a week before, so nothing is a past show. */
const NOW = new Date(2026, 6, 25, 12, 0, 0);

const SHOW = {
  id: 'heartland',
  name: 'Heartland Scent Work Classic',
  start_date: '2026-08-01',
  end_date: '2026-08-02',
};

type Row = {
  dog: string;
  entry_status: string;
  payment_status: string;
  payment_method: string | null;
  entry_fee: number | null;
  /**
   * `entries.registration_id` FKs to `enrollments` — the ORDER. When an order
   * was paid at checkout its per-entry rows are not individually reconciled
   * and keep a stale `pending`, so the order's status is authoritative. Buddy
   * and Codex Daisy both belong to a `paid` enrollment (paid_amount $210).
   */
  enrollment_payment_status?: string;
};

/** Verbatim staging rows, in the order the query returns them. */
const STAGING_ROWS: Row[] = [
  {
    dog: 'Buddy',
    entry_status: 'promotion-expired',
    payment_status: 'pending',
    payment_method: null,
    entry_fee: null,
  },
  {
    dog: 'Buddy',
    entry_status: 'submitted',
    payment_status: 'pending',
    payment_method: null,
    entry_fee: 30,
    enrollment_payment_status: 'paid',
  },
  {
    dog: 'Codex Daisy',
    entry_status: 'submitted',
    payment_status: 'pending',
    payment_method: null,
    entry_fee: 30,
    enrollment_payment_status: 'paid',
  },
  {
    dog: 'Juni',
    entry_status: 'not_accepted',
    payment_status: 'pending',
    payment_method: null,
    entry_fee: 30,
  },
  {
    dog: 'Juni',
    entry_status: 'paid',
    payment_status: 'paid',
    payment_method: 'online',
    entry_fee: 30,
  },
  {
    dog: 'Juni',
    entry_status: 'paid',
    payment_status: 'paid',
    payment_method: 'online',
    entry_fee: 30,
  },
  {
    dog: 'Juni',
    entry_status: 'promotion-expired',
    payment_status: 'pending',
    payment_method: null,
    entry_fee: null,
  },
  {
    dog: 'Ranger',
    entry_status: 'confirmed',
    payment_status: 'waived',
    payment_method: null,
    entry_fee: 30,
  },
  {
    dog: 'Ranger',
    entry_status: 'promotion-expired',
    payment_status: 'pending',
    payment_method: null,
    entry_fee: null,
  },
  {
    dog: 'Ranger',
    entry_status: 'withdrawn',
    payment_status: 'refunded',
    payment_method: null,
    entry_fee: 30,
  },
  {
    dog: 'Willow',
    entry_status: 'confirmed',
    payment_status: 'paid',
    payment_method: null,
    entry_fee: 30,
  },
  {
    dog: 'Willow',
    entry_status: 'confirmed',
    payment_status: 'paid',
    payment_method: 'online',
    entry_fee: null,
  },
  {
    dog: 'Willow',
    entry_status: 'confirmed',
    payment_status: 'paid',
    payment_method: 'online',
    entry_fee: null,
  },
  {
    dog: 'Willow',
    entry_status: 'confirmed',
    payment_status: 'waived',
    payment_method: null,
    entry_fee: 30,
  },
  {
    dog: 'Willow',
    entry_status: 'paid',
    payment_status: 'refunded',
    payment_method: 'online',
    entry_fee: 30,
  },
];

function rawRows(): EntryBalanceRawRow[] {
  return STAGING_ROWS.map((row, index) => ({
    id: `${row.dog}-${index}`,
    show_id: SHOW.id,
    entry_status: row.entry_status,
    payment_status: row.payment_status,
    payment_method: row.payment_method,
    entry_fee: row.entry_fee,
    show: SHOW,
    registration: row.enrollment_payment_status
      ? { payment_status: row.enrollment_payment_status }
      : null,
  }));
}

describe('seeded exhibitor amount due (staging fixture)', () => {
  it('counts only current, pending rows that carry a fee', () => {
    const sources = rawRows().map(mapEntryRowToBalanceSource);
    const eligible = sources.filter(source => isCurrentSummaryEntry(source, NOW));

    // not_accepted and withdrawn are terminal — the other 13 rows are current.
    expect(eligible).toHaveLength(13);
  });

  it('reports nothing due — the only fee-bearing pending rows sit on a paid order', () => {
    const summary = summarizeEntryBalances(rawRows().map(mapEntryRowToBalanceSource), NOW);

    // Buddy and Codex Daisy are the only current rows that are both
    // fee-bearing and row-level `pending`, and BOTH belong to an enrollment
    // that was paid at checkout ($210). The order's status wins, so neither is
    // debt. Every other current row is paid, waived, refunded, or fee-less.
    expect(summary.amountDueCents).toBe(0);
    expect(summary.onlineDueCents).toBe(0);
    expect(summary.payAtShowDueCents).toBe(0);
  });

  /**
   * Guards the precedence itself. Drop the enrollment override and the same
   * rows become $60 of debt — so a regression that stopped reading the order's
   * payment status would be caught here rather than by telling a paid-up
   * exhibitor they owe money.
   */
  it('would report $60.00 due if the paid order were ignored', () => {
    const withoutOrder = rawRows().map(row => ({ ...row, registration: null }));
    const summary = summarizeEntryBalances(withoutOrder.map(mapEntryRowToBalanceSource), NOW);

    expect(summary.amountDueCents).toBe(6000);
  });

  it('counts current fees across every non-terminal row', () => {
    const summary = summarizeEntryBalances(rawRows().map(mapEntryRowToBalanceSource), NOW);

    // 13 current rows, of which 8 carry a $30 fee (the promotion-expired rows
    // and two of Willow's online rows have none).
    expect(summary.currentFeesCents).toBe(24000);
  });
});
