import type { ShowPayoutRow } from './useClubStripeAccount';

export interface PayoutBadge {
  label: string;
  /** shadcn Badge variant — 'destructive' is the only one a treasurer must act on. */
  variant: 'default' | 'secondary' | 'destructive';
  /** Extra classes; non-empty only for the green "Paid" success badge. */
  className: string;
}

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
 *   status, two very different meanings. `payoutsEnabled` is the discriminator
 *   the cron itself routes on, so we reuse it: enabled → "Scheduled", not
 *   enabled → "Waiting for account".
 *
 * - `failed` means "will retry" ONLY for the cron's benign markers; any other
 *   reason won't self-heal and needs treasurer action → red "Needs attention".
 */
export function resolvePayoutBadge(
  payout: Pick<ShowPayoutRow, 'status' | 'failure_reason'>,
  payoutsEnabled: boolean
): PayoutBadge {
  switch (payout.status) {
    case 'completed':
      return {
        label: 'Paid',
        variant: 'default',
        className: 'bg-success text-success-foreground hover:bg-success',
      };
    case 'processing':
      return { label: 'Sending', variant: 'secondary', className: '' };
    case 'pending':
      return payoutsEnabled
        ? { label: 'Scheduled', variant: 'secondary', className: '' }
        : { label: 'Waiting for account', variant: 'secondary', className: '' };
    case 'failed':
      return isSelfHealingFailure(payout.failure_reason)
        ? { label: 'Retrying', variant: 'secondary', className: '' }
        : { label: 'Needs attention', variant: 'destructive', className: '' };
    default:
      return { label: payout.status, variant: 'secondary', className: '' };
  }
}
