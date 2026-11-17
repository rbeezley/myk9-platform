// The one PostgREST `or` filter that says which unsent entries a run may take (MYK9-2088).
// Deno-free so vitest can pin the exact string. Every query that selects or claims confirmation
// candidates sends it as its single .or(), beside plain AND filters (sent_at IS NULL and so on).

/**
 * (no lease AND status in `statuses`) OR (lease expired).
 *
 * - No lease: an ordinary candidate; only the statuses this run covers (the frequent run takes
 *   'pending', the daily run 'pending' and 'failed'), so an unleased failure waits for the daily run.
 * - Lease expired (`< now`, which a null lease never satisfies): an interrupted send, the provider
 *   may already have it. Taken on every run whatever its status, so a daily retry that was accepted
 *   but could not be stamped is not left for a next day that may fall outside Resend's 24h window.
 * - A live lease (`>= now`) matches neither branch: a running send is never overtaken.
 */
export function claimableFilter(statuses: readonly string[], nowIso: string): string {
  return (
    `and(confirmation_claimed_until.is.null,confirmation_email_status.in.(${statuses.join(',')})),` +
    `confirmation_claimed_until.lt.${nowIso}`
  );
}
