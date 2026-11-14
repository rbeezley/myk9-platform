// Pure decision logic for the card receipt's idempotency marker (MP-13, reworked by MYK9-1963).
//
// The stripe-webhook (`sendEntryConfirmationEmail`, on paid-online-entry checkout) sends the
// receipt. On a successful send it stamps entries.receipt_email_* , the receipt's OWN marker
// (migration 20261114223700), which the check/cash receipt in send-registration-email also uses.
// It deliberately does NOT touch entries.confirmation_email_*: that marker belongs to the
// pre-show confirmation (armband, judge, directions) the scheduled send-confirmation-email sender
// delivers on the confirmation date to everyone, card payers included (owner, 2026-11-14:
// two emails, two markers).
//
// A failed send stamps nothing. The card receipt's retry is the webhook's own replay
// (cart_fulfillments.receipt_sent_at, cartConfirmationReplay.ts), not the receipt sweep, so the
// row is left at status 'pending'.

export interface ReceiptStampInput {
  /** Whether the send-email call succeeded (response.ok on the fetch to send-email). */
  sendSucceeded: boolean;
  /** Resend message id returned by send-email's JSON body ({ id }), or null if unavailable. */
  messageId: string | null;
  /** ISO timestamp to stamp as receipt_email_sent_at (caller supplies `new Date().toISOString()`). */
  nowIso: string;
}

export interface ReceiptStampPayload {
  receipt_email_sent_at: string;
  receipt_email_message_id: string | null;
  receipt_email_status: 'sent';
  receipt_email_attempted_at: string;
}

/**
 * Returns the exact patch to write to each affected entry after a
 * receipt send, or `null` when the send failed (no write).
 */
export function buildReceiptStampPayload(input: ReceiptStampInput): ReceiptStampPayload | null {
  if (!input.sendSucceeded) {
    return null;
  }
  return {
    receipt_email_sent_at: input.nowIso,
    receipt_email_message_id: input.messageId,
    receipt_email_status: 'sent',
    receipt_email_attempted_at: input.nowIso,
  };
}

export interface PreShowSendStateLike {
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
export function isEligibleForScheduledConfirmationSend(entry: PreShowSendStateLike): boolean {
  return (
    entry.confirmation_email_sent_at === null &&
    (entry.confirmation_email_status === 'pending' || entry.confirmation_email_status === 'failed')
  );
}
