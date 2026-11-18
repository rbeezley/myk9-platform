// Operator-alert wording the payout run shares (MYK9-2170), kept apart from
// the flow so processShow and the Stripe reconciliation both use one copy.

const WAITS_AGAIN =
  'The next run recalculates this payout and it waits for approval again; nothing is sent until a site admin approves it.';

/**
 * What happens after a failed attempt, true in both brake modes: with the
 * brake on, the retry row is recalculated and waits for approval again.
 */
export function payoutRetryNote(
  kind: 'balance_delay' | 'transfer_failed' | 'stale_processing',
  brakeOn: boolean
): string {
  if (kind === 'balance_delay') {
    const delay =
      'This is the expected card-clearing delay. Show-day payments take ~2 business days to become available.';
    return brakeOn
      ? `<p>${delay} ${WAITS_AGAIN}</p>`
      : `<p>${delay} Tomorrow’s run retries automatically; no action needed.</p>`;
  }
  if (kind === 'transfer_failed') {
    const look =
      'A non-balance failure usually needs a look: check the show_payouts row and the Stripe dashboard.';
    return brakeOn
      ? `<p>${WAITS_AGAIN} ${look}</p>`
      : '<p>This will retry tomorrow, but a non-balance failure usually needs a look: check the show_payouts row and the Stripe dashboard.</p>';
  }
  const reconcile =
    'checks Stripe for an existing transfer for this show (transfer_group) and reconciles instead of paying twice.';
  return brakeOn
    ? `<p>${WAITS_AGAIN} Before any send, the run ${reconcile}</p>`
    : `<p>Before re-sending, the next run ${reconcile} No action needed unless it recurs.</p>`;
}
