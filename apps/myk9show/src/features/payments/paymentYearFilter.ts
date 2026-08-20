/**
 * Year scoping for the exhibitor's own payment ledger — the "doing my taxes in
 * January" case. An exhibitor several seasons in otherwise scrolls an unbounded
 * chronological list to find one season's spend.
 *
 * Deliberately pure and structural (`{ date }` only) so it composes with
 * `buildPaymentDisplayRows` output without importing the display row type, the
 * same way `paymentsSummary` takes a structural subset. Filtering display rows
 * rather than raw orders means the existing `summarizePaymentLedgerTotals` card
 * re-totals the year for free — no second money implementation.
 *
 * Cash-basis on purpose: a refund row carries its OWN date (see
 * `buildPaymentDisplayRows`), so a 2026 refund of a 2025 charge lands in 2026
 * and 2025 keeps the gross it actually paid that year. That is what a
 * cash-basis filing wants, and netting it backwards would silently restate a
 * year the exhibitor may already have filed.
 */

/** The "no year selected" sentinel. Kept out of the URL — see the page. */
export const ALL_PAYMENT_YEARS = 'all';

/** A year selection: `'all'`, or a four-digit calendar year as a string. */
export type PaymentYearSelection = string;

/** The minimal display-row shape the year filter needs (structural subset). */
export interface PaymentYearFilterRow {
  date: string | null;
}

/**
 * The calendar year a row is displayed under, or null when it has no usable
 * date.
 *
 * Uses the LOCAL year (`getFullYear`), not the ISO string's leading four
 * characters, because `formatPaymentDate` renders the local date. Stripe
 * timestamps are UTC, so a charge at 2026-01-01T02:00Z renders as
 * "Dec 31, 2025" in every US timezone — slicing the ISO string would file that
 * row under 2026 while the row beside it reads Dec 31, 2025, and the year
 * subtotal would disagree with the dates printed under it.
 */
export function paymentRowYear(row: PaymentYearFilterRow): string | null {
  if (!row.date) return null;
  const d = new Date(row.date);
  if (Number.isNaN(d.getTime())) return null;
  return String(d.getFullYear());
}

/**
 * Every year present in the rows, newest first. Undated rows contribute no
 * year — they are only ever reachable under "All time", which is the default,
 * so no money is hidden by that omission.
 */
export function listPaymentYears(rows: PaymentYearFilterRow[]): string[] {
  const years = new Set<string>();
  for (const row of rows) {
    const year = paymentRowYear(row);
    if (year) years.add(year);
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

/**
 * Narrow an untrusted `?year=` value against the years this exhibitor actually
 * has, mirroring `isEntryTabFilter`'s treatment of `?tab=`. A stale or typo'd
 * year falls back to "all" at the call site rather than rendering an empty
 * ledger, which on a money surface reads as "you paid nothing".
 */
export function isPaymentYearSelection(
  value: string | null | undefined,
  years: string[]
): value is PaymentYearSelection {
  return !!value && (value === ALL_PAYMENT_YEARS || years.includes(value));
}

/**
 * Whether a year control can change what the exhibitor sees.
 *
 * More than one year is the obvious case. The subtle one: a single year PLUS
 * undated rows is still two buckets, because only "All time" shows the undated
 * ones. Hiding the control there strands anyone who arrives on a valid
 * `?year=` link with no way back to the rows it filtered out.
 */
export function canFilterPaymentYears(rows: PaymentYearFilterRow[]): boolean {
  const years = listPaymentYears(rows);
  if (years.length > 1) return true;
  return years.length === 1 && rows.some(row => paymentRowYear(row) === null);
}

/**
 * Rows for the selected year. `'all'` (or any unrecognized selection) returns
 * the input untouched, including undated rows.
 */
export function filterPaymentRowsByYear<T extends PaymentYearFilterRow>(
  rows: T[],
  year: PaymentYearSelection
): T[] {
  if (year === ALL_PAYMENT_YEARS) return rows;
  return rows.filter(row => paymentRowYear(row) === year);
}
