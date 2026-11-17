import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { storeEmailContents, type EmailContentClient } from '../emailLogContent.ts';

/**
 * Delivery bookkeeping for trial-packet mail.
 *
 * Every other email this platform sends -- entry confirmations, waitlist
 * offers, password resets, nine types in all -- writes a row to `email_log`
 * that `resend-webhook` later updates to `delivered`, `bounced` or
 * `complained`. The emergency packet wrote nothing. Its only record was
 * `trial_packet_snapshots.delivery_status`, set to 'sent' at hand-off and
 * never touched again.
 *
 * So on 2026-08-22 the first live packet reported `sent` while one recipient
 * had bounced, and answering "did it actually arrive" needed the Resend
 * dashboard. For the one email whose whole purpose is that somebody has the
 * paper on show day, a bounce has to be visible in the product.
 */

export interface EmailAttempt {
  recipient: string;
  /** Resend's id for THIS recipient's message; null when the send failed. */
  messageId: string | null;
  /** Provider failure detail, or null on success. */
  error: string | null;
}

export interface EmailLogContext {
  emailType: 'trial_packet' | 'trial_packet_print_reminder' | 'judge_record';
  showId: string;
  /** The snapshot the mail refers to, so a row can be traced to its PDF. */
  relatedId: string;
  /** MYK9-2115: the text of the email, kept beside the row for the delivery history. */
  content?: { subject: string; html: string };
}

/**
 * Record one row per recipient.
 *
 * One row per RECIPIENT is only correct because each recipient now gets its
 * own Resend message: `resend-webhook` looks its row up with `.maybeSingle()`
 * on `resend_message_id`, which ERRORS on duplicates. Two rows sharing an id
 * would silently stop delivery events being recorded for that message.
 *
 * Never throws. A logging failure must not turn a delivered email into a
 * reported failure -- the caller would release its claim and send again, which
 * is exactly the duplicate-email trap `deliverStoredPacket` already carries a
 * comment about.
 */
export async function recordEmailLog(
  supabase: SupabaseClient,
  attempts: readonly EmailAttempt[],
  context: EmailLogContext
): Promise<void> {
  if (attempts.length === 0) return;

  // try/catch as well as the returned error: "never throws" has to hold for a
  // thrown rejection too, not just a PostgREST error object. Bookkeeping sits
  // AFTER the mail has left, so any escape here is a delivered email reported
  // as a failure.
  try {
    const rows = attempts.map(attempt => ({
      recipient_email: attempt.recipient,
      email_type: context.emailType,
      related_id: context.relatedId,
      show_id: context.showId,
      resend_message_id: attempt.messageId,
      status: attempt.messageId ? 'sent' : 'failed',
      error_message: attempt.error,
    }));
    if (!context.content) {
      const { error } = await supabase.from('email_log').insert(rows);
      if (error) throw error;
      return;
    }
    const { data, error } = await supabase.from('email_log').insert(rows).select('id');
    if (error) throw error;
    // A copy is kept only for a single sent row: the id is then certain to be that email's.
    const logged = (data ?? []) as { id: string }[];
    if (rows.length === 1 && rows[0]!.resend_message_id && logged.length === 1) {
      await storeEmailContents(supabase as unknown as EmailContentClient, [
        { emailLogId: logged[0]!.id, ...context.content },
      ]);
    }
  } catch (error) {
    console.error('recordEmailLog: delivery bookkeeping insert failed', {
      emailType: context.emailType,
      relatedId: context.relatedId,
      attempts: attempts.length,
      error,
    });
  }
}
