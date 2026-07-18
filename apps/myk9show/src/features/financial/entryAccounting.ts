// Cent-based accounting projection for every financially active entry
// (unified-financial-dashboard, MYK9-54, task 2.1).
//
// This is the primary record of club revenue. Unlike the printable Financial
// Report — which intentionally EXCLUDES lifecycle statuses such as withdrawn and
// scratched (see financialReportTotals.EXCLUDED_CURRENT_STATUSES) — this
// projection includes EVERY financially active entry: paid-then-withdrawn,
// refunded, waived, cash, and check records all keep their money facts.
//
// DRY / single source of truth: the per-line money math is NOT re-derived here.
// Each line delegates to `buildFinancialReportLine` (the exact rule set the
// printable report uses) and then converts to integer cents. The
// printable-report-included subset delegates to `calculateFinancialReportTotals`
// so it is, by construction, the same math the report renders — the parity test
// (task 2.4) proves that overlap cent-for-cent by an independent line-sum path.
//
// Pure TypeScript only: no React, no hooks, no I/O. Money is integer cents.
import type { ReportEntry } from '@/lib/reports/types';
import {
  buildFinancialReportLine,
  calculateFinancialReportTotals,
  isEntryIncludedInFinancialReport,
  type FinancialReportBucket,
  type FinancialReportMode,
} from '@/components/reports/financialReportTotals';

const CENTS_PER_DOLLAR = 100;

/** Convert a dollar amount (the printable report's unit) to integer cents. */
export function dollarsToCents(dollars: number): number {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(dollars * CENTS_PER_DOLLAR);
}

/** One financially active entry projected into integer cents. */
export interface EntryAccountingLine {
  entryId: string;
  paymentLabel: string;
  grossCents: number;
  discountCents: number;
  netFeeCents: number;
  collectedCents: number;
  refundedCents: number;
  outstandingCents: number;
  waivedCents: number;
  netRetainedCents: number;
  /**
   * True when this entry falls inside the printable Financial Report's filtered
   * set for the given mode. A paid-then-withdrawn entry is `false` here yet still
   * carries its collected/refunded cents in the projection totals.
   */
  includedInPrintableReport: boolean;
}

/** Cent-based totals across a set of accounting lines. */
export interface EntryAccountingTotals {
  entryCount: number;
  grossCents: number;
  discountCents: number;
  waivedCents: number;
  collectedCents: number;
  refundedCents: number;
  outstandingCents: number;
  netRetainedCents: number;
}

export interface EntryAccountingProjection {
  lines: EntryAccountingLine[];
  /** Totals across EVERY financially active entry (no lifecycle exclusion). */
  totals: EntryAccountingTotals;
  /**
   * Totals across only the printable-report-included subset, derived from
   * `calculateFinancialReportTotals` so they match the printable closeout.
   */
  printableReportTotals: EntryAccountingTotals;
}

/** Project one entry into a cent-based accounting line, delegating the money
 *  rules to the printable report's `buildFinancialReportLine`. */
export function buildEntryAccountingLine(
  entry: ReportEntry,
  mode: FinancialReportMode = 'current'
): EntryAccountingLine {
  const line = buildFinancialReportLine(entry);
  return {
    entryId: entry.id,
    paymentLabel: line.paymentLabel,
    grossCents: dollarsToCents(line.gross),
    discountCents: dollarsToCents(line.discount),
    netFeeCents: dollarsToCents(line.netFee),
    collectedCents: dollarsToCents(line.collected),
    refundedCents: dollarsToCents(line.refunded),
    outstandingCents: dollarsToCents(line.outstanding),
    waivedCents: dollarsToCents(line.waived),
    netRetainedCents: dollarsToCents(line.netRetained),
    includedInPrintableReport: isEntryIncludedInFinancialReport(entry, mode),
  };
}

function emptyTotals(): EntryAccountingTotals {
  return {
    entryCount: 0,
    grossCents: 0,
    discountCents: 0,
    waivedCents: 0,
    collectedCents: 0,
    refundedCents: 0,
    outstandingCents: 0,
    netRetainedCents: 0,
  };
}

/** Sum accounting lines into cent-based totals. */
export function sumEntryAccountingLines(lines: EntryAccountingLine[]): EntryAccountingTotals {
  const totals = emptyTotals();
  for (const line of lines) {
    totals.entryCount += 1;
    totals.grossCents += line.grossCents;
    totals.discountCents += line.discountCents;
    totals.waivedCents += line.waivedCents;
    totals.collectedCents += line.collectedCents;
    totals.refundedCents += line.refundedCents;
    totals.outstandingCents += line.outstandingCents;
    totals.netRetainedCents += line.netRetainedCents;
  }
  return totals;
}

/** Convert a printable-report dollar bucket into cent-based accounting totals. */
export function centifyReportBucket(bucket: FinancialReportBucket): EntryAccountingTotals {
  return {
    entryCount: bucket.count,
    grossCents: dollarsToCents(bucket.gross),
    discountCents: dollarsToCents(bucket.discount),
    waivedCents: dollarsToCents(bucket.waived),
    collectedCents: dollarsToCents(bucket.collected),
    refundedCents: dollarsToCents(bucket.refunded),
    outstandingCents: dollarsToCents(bucket.outstanding),
    netRetainedCents: dollarsToCents(bucket.netRetained),
  };
}

/**
 * Build the full cent-based accounting projection.
 *
 * `totals` covers every financially active entry; `printableReportTotals` covers
 * only the printable report's filtered subset (delegated to the report function
 * so closeout parity holds by construction).
 */
export function calculateEntryAccounting(
  entries: ReportEntry[],
  mode: FinancialReportMode = 'current'
): EntryAccountingProjection {
  const lines = entries.map(entry => buildEntryAccountingLine(entry, mode));
  const totals = sumEntryAccountingLines(lines);
  const printableReportTotals = centifyReportBucket(
    calculateFinancialReportTotals(entries, mode).summary
  );
  return { lines, totals, printableReportTotals };
}
