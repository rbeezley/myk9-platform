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
 * Original outcome (2026-07): $0 was called correct, on the premise that
 * per-entry rows are "not reconciled" after an order-level payment and keep a
 * harmless stale `pending`. MYK9-495 falsified that premise. `enrollments` is
 * uniquely keyed (show_id, handler_id) — ONE row per exhibitor per show, reused
 * by every later submission — so a `paid` order says nothing about an entry
 * added afterwards, and `submit_show_entries` already stamps entries `paid` /
 * `waived` for the secretary_paid, group_payment and waived orders that really
 * are settled at order level. A fee-bearing `pending` entry row is therefore
 * real debt, and this fixture carries $60.00 of it.
 *
 * Fixture is verbatim from staging (`Heartland Scent Work Classic`, owner
 * exhibitor@myk9t.com) — 15 per-class rows across 5 dogs, spanning
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
   * `entries.registration_id` FKs to `enrollments` — the ORDER. Buddy and
   * Codex Daisy both belong to a `paid` enrollment, and both entry rows still
   * read `pending`: the MYK9-495 shape.
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

  it('reports the $60.00 the pending rows owe, despite their paid order', () => {
    const summary = summarizeEntryBalances(rawRows().map(mapEntryRowToBalanceSource), NOW);

    // Buddy and Codex Daisy are the only current rows that are both
    // fee-bearing and row-level `pending`. Both sit under a `paid` enrollment,
    // which used to zero them out — the MYK9-495 masking. Every other current
    // row is paid, waived, refunded, or fee-less.
    expect(summary.amountDueCents).toBe(6000);
    expect(summary.onlineDueCents).toBe(6000);
    expect(summary.payAtShowDueCents).toBe(0);
  });

  /**
   * Pins that the order status is not simply ignored: with the enrollment
   * dropped entirely the same rows produce the same figure, so the number above
   * comes from the ENTRY rows, and the order's role is only to fill in where an
   * entry has no status of its own.
   */
  it('reports the same $60.00 with no order attached at all', () => {
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
