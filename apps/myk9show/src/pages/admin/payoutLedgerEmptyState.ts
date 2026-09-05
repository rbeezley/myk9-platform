/**
 * Empty-state copy for the payout ledger on /admin/payouts (MYK9-395).
 *
 * The page carries TWO independently-sourced money surfaces: the platform
 * income overview (charge-derived, from the financial reconciliation RPCs) and
 * the payout ledger (entry-derived, from usePlatformPayoutLedger). An empty
 * ledger is evidence about the LEDGER's scope only — it is not evidence that no
 * exhibitor has ever paid online. Saying "No online payments yet" beside a
 * nonzero "Online collected" above states something the ledger cannot know, and
 * leaves the operator unable to tell a reconciliation gap from a scope
 * difference.
 *
 * This module owns that decision as a pure function so the variants are
 * testable. It makes NO claim about whether money is owed or paid: the overview
 * total is used only to decide whether "nobody has paid yet" is still a
 * defensible sentence.
 */

/**
 * What the page knows about the overview's charge activity.
 *
 * A discriminated state, not a bare number, because "still loading / failed to
 * load" must not collapse into zero — that is the same class of bug this fix
 * exists to remove.
 *
 * The figure is GROSS charged, deliberately not the displayed "Online
 * collected". Collected is net — `grossCharged - refunded - makeWholeRefunded`
 * (financialSummary.ts `derivePlatformIncome`) — so a history whose charges
 * were all refunded nets to zero, and discriminating on it would resurrect the
 * exact false claim this module exists to prevent: "No online payments yet"
 * over payments that demonstrably happened and were returned.
 */
export type OverviewChargeActivity =
  { status: 'unknown' } | { status: 'known'; grossChargedCents: number };

export type PayoutLedgerEmptyVariant =
  /** Overview says nothing was ever charged: the genuine pre-first-payment state. */
  | 'no-payments-yet'
  /** Overview reports charge activity, yet this ledger has no rows. */
  | 'reconciliation-boundary'
  /** Overview figures are loading or unavailable — assert neither variant. */
  | 'unconfirmed';

export interface PayoutLedgerEmptyState {
  variant: PayoutLedgerEmptyVariant;
  headline: string;
  detail: string;
  /**
   * Where to look next. Points at the per-figure "How this is calculated"
   * disclosures already rendered by the platform income card above — an
   * in-page drill-down, so there is no route to go stale.
   */
  guidance?: string;
}

export interface PayoutLedgerEmptyStateInput {
  rowCount: number;
  overviewCharges: OverviewChargeActivity;
}

/**
 * Returns the empty state to render, or `null` when the ledger has rows and no
 * empty state applies.
 */
export function resolvePayoutLedgerEmptyState({
  rowCount,
  overviewCharges,
}: PayoutLedgerEmptyStateInput): PayoutLedgerEmptyState | null {
  if (rowCount > 0) return null;

  if (overviewCharges.status === 'unknown') {
    return {
      variant: 'unconfirmed',
      headline: 'No club liabilities to show.',
      detail:
        'This ledger found no online entries to bill. Platform income above has not loaded, so ' +
        'this page cannot say whether that is the whole picture.',
    };
  }

  if (overviewCharges.grossChargedCents > 0) {
    return {
      variant: 'reconciliation-boundary',
      headline: 'No club liabilities to show.',
      detail:
        'This ledger is built from online entries, while the platform income figures above are ' +
        'built from Stripe charges. The two scopes can legitimately differ, so payment activity ' +
        'above with nothing here does not by itself mean money is missing or owed.',
      guidance:
        'To compare the two, open "How this is calculated" under each figure above — it names the ' +
        'exact source of that number.',
    };
  }

  return {
    variant: 'no-payments-yet',
    headline: 'No online payments yet.',
    detail: 'Club liabilities appear here once exhibitors pay online.',
  };
}
