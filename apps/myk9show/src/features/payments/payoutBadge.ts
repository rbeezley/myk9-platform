import type { ShowPayoutRow } from './useClubStripeAccount';
import { NEUTRAL_STATUS_CHIP, WAITING_STATUS_CHIP } from '@/components/ui/statusChip';

export interface PayoutBadge {
  label: string;
  /** shadcn Badge variant — 'destructive' is the only one a treasurer must act on. */
  variant: 'default' | 'secondary' | 'destructive';
  /**
   * Extra classes. Always non-empty: every neutral state carries a `--chip-*`
   * pair because `variant="secondary"` collapses to 1.00:1 on a dark card.
   */
  className: string;
}

/**
 * Whether the club's Stripe account can receive payouts.
 *
 * INTENT: `'unknown'` is NOT a synonym for `'not-enabled'`. It means the account
 * row has not been read yet, or could not be read. This was a `boolean`, and a
 * boolean cannot hold that third case: every caller derived it as
 * `!!account && account.payouts_enabled`, which is `false` while the query is
 * loading AND while it has errored. That `false` then travelled down into a
 * treasurer-facing badge reading "Waiting for account" — telling a fully
 * onboarded club its money was stuck behind a missing bank account, on the
 * strength of data nobody had successfully read.
 *
 * A three-state union rather than `boolean | 'unknown'` on purpose: the string
 * `'unknown'` is truthy, so the looser type would silently route every unknown
 * through the `enabled` branch and trade one false claim for another. Keeping
 * the states nominal makes the compiler name every site that has to choose.
 */
export type PayoutsAccountState = 'enabled' | 'not-enabled' | 'unknown';

/**
 * Cron failure_reason markers whose rows auto-recover on the next daily run
 * (see cron-process-payouts): a card-clearing balance delay, a stale
 * 'processing' row reopened for retry, or a transient post-claim entries load.
 * Anything else is a genuine Stripe failure that won't self-heal.
 *
 * A failed row with no reason is treated as needs-attention: the cron always
 * stamps a reason, so a blank one is itself anomalous and worth a human look.
 */
function isSelfHealingFailure(failureReason: string | null | undefined): boolean {
  if (!failureReason) return false;
  return (
    failureReason.startsWith('insufficient_balance') ||
    failureReason === 'stale_processing' ||
    failureReason === 'entries_load_failed_post_claim'
  );
}

/**
 * Resolve the treasurer-facing badge for one show_payouts row.
 *
 * Two statuses are context-dependent and so cannot be a static label map:
 *
 * - `pending` means "no bank account yet" ONLY while the club is not enabled.
 *   The cron parks a pending row both when the club hasn't onboarded AND when an
 *   onboarded club's transfer simply hasn't been sent by the next run — the same
 *   status, two very different meanings. `accountState` is the discriminator
 *   the cron itself routes on, so we reuse it: enabled → "Scheduled", not
 *   enabled → "Waiting for account". When the account state is unknown we can
 *   say neither, so we fall back to "Not sent yet": the one thing a pending row
 *   guarantees regardless of why.
 *
 * - `failed` means "will retry" ONLY for the cron's benign markers; any other
 *   reason won't self-heal and needs treasurer action → red "Needs attention".
 */
export function resolvePayoutBadge(
  payout: Pick<ShowPayoutRow, 'status' | 'failure_reason'> & {
    /**
     * A later attempt for the same show succeeded, is in flight, or failed
     * after this one. Such a row is history, and calling it "Needs attention"
     * sends a treasurer chasing money that already moved.
     */
    superseded?: boolean;
  },
  accountState: PayoutsAccountState
): PayoutBadge {
  switch (payout.status) {
    case 'completed':
      return {
        label: 'Paid',
        variant: 'default',
        className: 'bg-success text-success-foreground hover:bg-success',
      };
    case 'processing':
      return { label: 'Sending', variant: 'secondary', className: NEUTRAL_STATUS_CHIP };
    case 'pending':
      if (accountState === 'enabled') {
        return { label: 'Scheduled', variant: 'secondary', className: NEUTRAL_STATUS_CHIP };
      }
      if (accountState === 'not-enabled') {
        // Amber, not stone: this one is waiting on the treasurer to connect an
        // account, which is the only neutral state here that implies an action.
        return { label: 'Waiting for account', variant: 'secondary', className: WAITING_STATUS_CHIP };
      }
      return { label: 'Not sent yet', variant: 'secondary', className: NEUTRAL_STATUS_CHIP };
    case 'failed':
      if (payout.superseded) {
        return { label: 'Earlier attempt', variant: 'secondary', className: NEUTRAL_STATUS_CHIP };
      }
      return isSelfHealingFailure(payout.failure_reason)
        ? { label: 'Retrying', variant: 'secondary', className: NEUTRAL_STATUS_CHIP }
        : { label: 'Needs attention', variant: 'destructive', className: '' };
    default:
      // INTENT: never render a raw database enum to a treasurer. An unrecognised
      // status is a status we cannot explain, so say exactly that rather than
      // leaking `show_payouts.status` verbatim into the UI.
      return { label: 'Status unavailable', variant: 'secondary', className: NEUTRAL_STATUS_CHIP };
  }
}
