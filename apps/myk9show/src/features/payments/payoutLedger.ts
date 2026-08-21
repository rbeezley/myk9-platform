/**
 * Pure payout-ledger math for the admin cross-club liabilities view.
 *
 * `calculateShowPayoutCents` MIRRORS the authoritative server copy at
 * `apps/myk9show/supabase/functions/_shared/payoutCalc.ts` (the cron that
 * actually issues transfers). It is duplicated, not imported, because the edge
 * function lives outside the pnpm workspace and React cannot import it. The
 * colocated test pins the two identical — change both together.
 */

import { isUnresolvedPullRefundDecision } from './pullReconciliation';

/** entries row shape needed to compute a club's online liability for a show. */
export interface LedgerEntryRow {
  show_id: string;
  entry_status: string | null;
  /** entries.entry_fee — DECIMAL dollars (no cents column). */
  entry_fee: number | null;
  payment_method: string | null;
  payment_status: string | null;
  /** entries.refund_amount — DECIMAL dollars, service-role-only. */
  refund_amount: number | null;
  /** Explicit secretary decision; refunded rows are also resolved by refund_amount. */
  refund_decision: string | null;
}

/**
 * The club's share of a show: every entry paid ONLINE, minus per-entry refunds.
 * Keys the deduction on refund_amount (not payment_status) so a partial refund
 * leaves the remainder owed and a forged status flip can't shrink the payout.
 * Mirror of _shared/payoutCalc.ts calculateShowPayoutCents.
 */
export function calculateShowPayoutCents(entries: LedgerEntryRow[]): number {
  return entries
    .filter(
      e =>
        e.payment_method === 'online' &&
        (e.payment_status === 'paid' || e.payment_status === 'refunded')
    )
    .reduce((sum, e) => {
      const feeCents = Math.round((e.entry_fee ?? 0) * 100);
      const refundCents = Math.round((e.refund_amount ?? 0) * 100);
      return sum + Math.max(0, feeCents - refundCents);
    }, 0);
}

/**
 * Total online fees collected for a show, GROSS (before refunds). Includes both
 * 'paid' and 'refunded' entries — a refunded entry was still charged before the
 * refund, so excluding it would understate collected while refunds are shown
 * separately (then Collected − Refunds == Net owed).
 */
export function sumOnlineCollectedCents(entries: LedgerEntryRow[]): number {
  return entries
    .filter(
      e =>
        e.payment_method === 'online' &&
        (e.payment_status === 'paid' || e.payment_status === 'refunded')
    )
    .reduce((sum, e) => sum + Math.round((e.entry_fee ?? 0) * 100), 0);
}

/**
 * Total refunded across a show's online entries.
 *
 * Filters on the SAME predicate as `sumOnlineCollectedCents`. It previously
 * keyed on `payment_method` alone, so an online entry with a non-zero
 * `refund_amount` but a payment_status of pending/failed/null contributed to
 * Refunds while contributing nothing to Collected — and the table presents those
 * two columns as a subtraction, so the row read as `$0.00 / -$25.00 / $0.00`.
 * A refund of money that was never collected is a data error worth seeing, but
 * not in a column that claims to net against a figure it is not part of.
 */
export function sumRefundedCents(entries: LedgerEntryRow[]): number {
  return entries
    .filter(
      e =>
        e.payment_method === 'online' &&
        (e.payment_status === 'paid' || e.payment_status === 'refunded')
    )
    .reduce((sum, e) => sum + Math.round((e.refund_amount ?? 0) * 100), 0);
}

/** Where a row's Net owed figure came from. */
export type NetOwedSource = 'computed' | 'transfer';

/**
 * How to describe a show with no payout row yet.
 *
 * `payoutStatus: null` covers two situations an operator must act on
 * differently, and the old single "Not settled" badge collapsed them: a show
 * settling next month, and a show whose settle date passed with no transfer
 * ever created. The second is money stuck behind a cron that did not run, and
 * it looked identical to the first.
 */
export type UnsettledState = 'unscheduled' | 'scheduled' | 'overdue';

export function resolveUnsettledState(settleDate: string | null, today: string): UnsettledState {
  if (!settleDate) return 'unscheduled';
  return settleDate < today ? 'overdue' : 'scheduled';
}

export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface LedgerShow {
  id: string;
  name: string;
  club_id: string | null;
  clubName: string | null;
  /** shows.end_date — settle window is end_date + 3 days (matches the cron). */
  endDate: string | null;
}

export interface LedgerPayout {
  show_id: string;
  amount_cents: number;
  status: PayoutStatus;
  stripe_transfer_id: string | null;
  completed_at: string | null;
  created_at: string | null;
}

// completed > processing > pending > failed. The cron keeps exactly one
// non-failed row per show (its liveRow query is `.neq('status','failed')`);
// failed rows accumulate as history. So a non-failed row always wins, and
// failed is shown only when it's the sole outcome.
const PAYOUT_STATUS_PRIORITY: Record<PayoutStatus, number> = {
  completed: 3,
  processing: 2,
  pending: 1,
  failed: 0,
};

/**
 * The canonical payout row for a show from its (possibly multiple) rows: the
 * non-failed live row if one exists, else the most recent failed attempt.
 */
export function pickCanonicalPayout(payouts: LedgerPayout[]): LedgerPayout | undefined {
  if (payouts.length === 0) return undefined;
  return [...payouts].sort((a, b) => {
    const byStatus = PAYOUT_STATUS_PRIORITY[b.status] - PAYOUT_STATUS_PRIORITY[a.status];
    if (byStatus !== 0) return byStatus;
    // Same status → most recent first (nulls last).
    return (b.created_at ?? '') < (a.created_at ?? '') ? -1 : 1;
  })[0];
}

export interface LedgerRow {
  showId: string;
  /** null only when the show row could not be read — see `showUnavailable`. */
  showName: string | null;
  clubId: string | null;
  clubName: string | null;
  /**
   * The entries for this show were read, but the `shows` row was not.
   *
   * A site admin can hold entries for a show they cannot select: `entries_select`
   * reaches admins via `manageable_show_ids()`, which is SECURITY DEFINER and
   * carries NO `deleted_at` filter, while `shows_select` ANDs `deleted_at IS NULL`
   * OUTSIDE its role arms — so soft-deleting a show hides the show and keeps its
   * entries. This row exists so that money still reaches the totals instead of
   * silently vanishing with the unreadable show (MYK9-233).
   */
  showUnavailable: boolean;
  onlineCollectedCents: number;
  refundedCents: number;
  unresolvedRefundDecisionCount: number;
  /** What the club is owed: the live payout row if one exists, else computed. */
  netOwedCents: number;
  /**
   * Whether netOwedCents was COMPUTED from entries or taken from the payout row.
   *
   * The table shows Collected / Refunds / Net owed side by side, which reads as
   * a subtraction. For a 'transfer' row it is not one: the figure is what the
   * cron will send (or sent), frozen when that row was written, so a refund
   * landing afterwards leaves the three columns not adding up. The UI needs to
   * say which it is rather than let the operator discover it as an arithmetic
   * error in their own reconciliation.
   */
  netOwedSource: NetOwedSource;
  /** Settle date = end_date + 3 days, ISO date (null if the show has no end). */
  settleDate: string | null;
  payoutStatus: PayoutStatus | null;
  stripeTransferId: string | null;
}

const SETTLE_BUFFER_DAYS = 3;

/** end_date + 3 days as an ISO date string (YYYY-MM-DD), or null. */
export function computeSettleDate(endDate: string | null): string | null {
  if (!endDate) return null;
  const d = new Date(endDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + SETTLE_BUFFER_DAYS);
  return d.toISOString().slice(0, 10);
}

/**
 * Join shows + their online entries + any existing payout row into ledger rows.
 * Net owed prefers the live show_payouts.amount_cents (what the cron will/did
 * transfer); for shows with no payout row yet it falls back to the computed
 * liability. Sorted by settle date descending (soonest-settling/newest first),
 * nulls last.
 */
export function buildLedgerRows(
  shows: LedgerShow[],
  entriesByShow: Map<string, LedgerEntryRow[]>,
  payoutsByShow: Map<string, LedgerPayout[]>
): LedgerRow[] {
  const rows = shows.map((show): LedgerRow => {
    const entries = entriesByShow.get(show.id) ?? [];
    const payout = pickCanonicalPayout(payoutsByShow.get(show.id) ?? []);
    const computedNet = calculateShowPayoutCents(entries);
    // Trust the stored amount only for a non-failed canonical row (completed =
    // what was transferred; processing/pending = the cron's current intent).
    // A failed row's amount_cents is stale: the cron recomputes from entries on
    // retry and refunds are allowed while no non-failed row exists, so a refund
    // after a failure would shrink the real liability below the failed figure.
    // Use the computed net there, but still surface the 'failed' status.
    const useStoredAmount = !!payout && payout.status !== 'failed';
    return {
      showId: show.id,
      showName: show.name,
      clubId: show.club_id,
      clubName: show.clubName,
      showUnavailable: false,
      onlineCollectedCents: sumOnlineCollectedCents(entries),
      refundedCents: sumRefundedCents(entries),
      unresolvedRefundDecisionCount: entries.filter(isUnresolvedPullRefundDecision).length,
      netOwedCents: useStoredAmount ? payout.amount_cents : computedNet,
      netOwedSource: useStoredAmount ? 'transfer' : 'computed',
      settleDate: computeSettleDate(show.endDate),
      payoutStatus: payout ? payout.status : null,
      stripeTransferId: payout?.stripe_transfer_id ?? null,
    };
  });

  // Any show we hold entries for but could NOT read a `shows` row for. Mapping
  // over `shows` alone would drop these rows AND their cents from every total,
  // reporting a smaller liability than the platform actually owes — as a
  // confident figure, with nothing on screen. Emit them instead: the money is
  // real and counted; only the show's identity is missing.
  const resolvedShowIds = new Set(shows.map(s => s.id));
  for (const [showId, entries] of entriesByShow) {
    if (resolvedShowIds.has(showId)) continue;
    const payout = pickCanonicalPayout(payoutsByShow.get(showId) ?? []);
    const useStoredAmount = !!payout && payout.status !== 'failed';
    rows.push({
      showId,
      showName: null,
      clubId: null,
      clubName: null,
      showUnavailable: true,
      onlineCollectedCents: sumOnlineCollectedCents(entries),
      refundedCents: sumRefundedCents(entries),
      unresolvedRefundDecisionCount: entries.filter(isUnresolvedPullRefundDecision).length,
      netOwedCents: useStoredAmount ? payout.amount_cents : calculateShowPayoutCents(entries),
      netOwedSource: useStoredAmount ? 'transfer' : 'computed',
      // No show row means no end_date, so no settle date can be derived.
      settleDate: null,
      payoutStatus: payout ? payout.status : null,
      stripeTransferId: payout?.stripe_transfer_id ?? null,
    });
  }

  return rows.sort((a, b) => {
    if (a.settleDate === b.settleDate) return 0;
    if (!a.settleDate) return 1;
    if (!b.settleDate) return -1;
    return a.settleDate < b.settleDate ? 1 : -1;
  });
}

/** Operator totals across the ledger: outstanding liability + lifetime paid. */
export function summarizeLedger(rows: LedgerRow[]): {
  outstandingCents: number;
  paidOutCents: number;
  /**
   * How many rows carry money for a show whose record could not be read. The
   * cents ARE included in the totals above; this count exists so the page can
   * say the identities are missing rather than leave the operator to notice.
   */
  unavailableShowCount: number;
} {
  return rows.reduce(
    (acc, r) => {
      if (r.payoutStatus === 'completed') {
        acc.paidOutCents += r.netOwedCents;
      } else {
        acc.outstandingCents += r.netOwedCents;
      }
      if (r.showUnavailable) acc.unavailableShowCount += 1;
      return acc;
    },
    { outstandingCents: 0, paidOutCents: 0, unavailableShowCount: 0 }
  );
}
