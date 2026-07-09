// Pure decision logic for MP-13: confirmation-email idempotency across the
// stripe-webhook (`sendEntryConfirmationEmail`, on paid-online-entry
// checkout) and the scheduled `send-confirmation-email` Heritage sender.
//
// The webhook never used to stamp `entries.confirmation_email_*` after a
// successful send, so the scheduled sender's audience query — which selects
// entries `WHERE confirmation_email_sent_at IS NULL AND
// confirmation_email_status IN ('pending', 'failed')`
// (supabase/functions/send-confirmation-email/index.ts:437-439) — would
// re-select and re-send confirmation for the same entry. The fix stamps the
// entry from the webhook path using the SAME send-state semantics the
// scheduled sender already writes on its own successful send
// (supabase/functions/send-confirmation-email/index.ts:597-606): set
// `confirmation_email_sent_at` (now), `confirmation_email_message_id` (the
// Resend message id, or null if unavailable), `confirmation_email_status =
// 'sent'`. A failed send stamps nothing, so the row is untouched and the
// scheduled sender's WHERE clause still selects it as the retry path — this
// is deliberate (design.md decision 4), not a bug.

export interface ConfirmationStampInput {
  /** Whether the send-email call succeeded (response.ok on the fetch to send-email). */
  sendSucceeded: boolean;
  /** Resend message id returned by send-email's JSON body ({ id }), or null if unavailable. */
  messageId: string | null;
  /** ISO timestamp to stamp as confirmation_email_sent_at (caller supplies `new Date().toISOString()`). */
  nowIso: string;
}

export interface ConfirmationStampPayload {
  confirmation_email_sent_at: string;
  confirmation_email_message_id: string | null;
  confirmation_email_status: 'sent';
}

/**
 * Returns the exact patch to write to each affected entry after a
 * confirmation-email send, or `null` when the send failed (no write — the
 * scheduled sender remains the retry path).
 */
export function buildConfirmationStampPayload(
  input: ConfirmationStampInput
): ConfirmationStampPayload | null {
  if (!input.sendSucceeded) {
    return null;
  }
  return {
    confirmation_email_sent_at: input.nowIso,
    confirmation_email_message_id: input.messageId,
    confirmation_email_status: 'sent',
  };
}

export interface ConfirmationSendStateLike {
  confirmation_email_sent_at: string | null;
  confirmation_email_status: string;
}

/**
 * Mirrors the scheduled sender's audience WHERE clause
 * (supabase/functions/send-confirmation-email/index.ts:437-439):
 *   .is('confirmation_email_sent_at', null)
 *   .in('confirmation_email_status', ['pending', 'failed'])
 *
 * Keep this predicate in sync with that query — it exists so tests can
 * assert the exactly-one-email property (an entry stamped by the webhook
 * path is no longer eligible here) without hitting the DB. Do NOT modify
 * send-confirmation-email/index.ts's own query to match a future edit here;
 * this file follows that query, not the other way around.
 */
export function isEligibleForScheduledConfirmationSend(entry: ConfirmationSendStateLike): boolean {
  return (
    entry.confirmation_email_sent_at === null &&
    (entry.confirmation_email_status === 'pending' || entry.confirmation_email_status === 'failed')
  );
}
