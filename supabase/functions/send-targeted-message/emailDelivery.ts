import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import type { EmailAudience, EmailRecipient } from './targeting.ts';

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
const EMAIL_CHUNK_SIZE = 10;

export const SHOW_MESSAGE_EMAIL_TYPE = 'show_message';

export interface SendShowMessageEmailsArgs {
  showId: string;
  showName: string;
  body: string;
  messageId: string | null;
  recipients: EmailRecipient[];
}

export interface EmailLogRow {
  recipient_email: string;
  email_type: string;
  related_id: string | null;
  resend_message_id: string | null;
  status: 'sent' | 'failed';
  error_message: string | null;
  show_id: string;
}

export interface SendShowMessageEmailsResult {
  sent: number;
  failed: number;
  // One row per attempt, for the caller to write to email_log.
  logRows: EmailLogRow[];
}

export type SendShowMessageEmails = (
  args: SendShowMessageEmailsArgs
) => Promise<SendShowMessageEmailsResult>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildShowMessageEmailSubject(showName: string): string {
  return `Message from the show secretary - ${showName}`;
}

export function buildShowMessageEmailHtml(args: {
  showName: string;
  body: string;
  name: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="background-color: #ffffff; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1f2937; padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">myK9Show</h1>
      </div>
      <div style="padding: 32px;">
        <p style="margin: 0 0 8px;">Hi ${escapeHtml(args.name)},</p>
        <p style="margin: 0 0 16px; color: #6b7280;">A message from the show secretary for <strong>${escapeHtml(args.showName)}</strong>:</p>
        <div style="background-color: #eff6ff; border-radius: 6px; padding: 16px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0; color: #1e3a5f; font-size: 15px; line-height: 24px; white-space: pre-line;">${escapeHtml(args.body)}</p>
        </div>
      </div>
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">You are receiving this because you have an entry in this show.<br>Sent by myK9Show.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Sends one email per recipient through Resend and reports what happened. Never
// throws for a single bad address: a failure is a counted, logged result.
export function createShowMessageEmailSender(deps: {
  apiKey: string | undefined;
  fetchImpl?: typeof fetch;
}): SendShowMessageEmails {
  return async args => {
    const logRows: EmailLogRow[] = [];
    let sent = 0;
    let failed = 0;
    const row = (
      recipient: EmailRecipient,
      status: 'sent' | 'failed',
      resendId: string | null,
      error: string | null
    ): EmailLogRow => ({
      recipient_email: recipient.email,
      email_type: SHOW_MESSAGE_EMAIL_TYPE,
      related_id: args.messageId,
      resend_message_id: resendId,
      status,
      error_message: error,
      show_id: args.showId,
    });

    for (let i = 0; i < args.recipients.length; i += EMAIL_CHUNK_SIZE) {
      const chunk = args.recipients.slice(i, i + EMAIL_CHUNK_SIZE);
      await Promise.all(
        chunk.map(async recipient => {
          if (!deps.apiKey) {
            failed++;
            logRows.push(row(recipient, 'failed', null, 'email_not_configured'));
            return;
          }
          try {
            const response = await sendResendEmailWithRetry(
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${deps.apiKey}`,
                },
                body: JSON.stringify({
                  from: FROM_EMAIL,
                  to: recipient.email,
                  subject: buildShowMessageEmailSubject(args.showName),
                  html: buildShowMessageEmailHtml({
                    showName: args.showName,
                    body: args.body,
                    name: recipient.name,
                  }),
                }),
              },
              deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}
            );
            if (!response.ok) {
              await response.text();
              failed++;
              logRows.push(row(recipient, 'failed', null, `provider_http_${response.status}`));
              return;
            }
            const result = (await response.json()) as { id?: string };
            sent++;
            logRows.push(row(recipient, 'sent', result.id ?? null, null));
          } catch {
            failed++;
            logRows.push(row(recipient, 'failed', null, 'email_delivery_error'));
          }
        })
      );
    }

    return { sent, failed, logRows };
  };
}

// Delivery history is best-effort after the mail has gone out: failing the request
// here would invite a retry that emails everyone twice.
export async function writeEmailLog(
  supabase: { from(table: string): { insert(rows: unknown): PromiseLike<{ error: unknown }> } },
  rows: EmailLogRow[]
): Promise<boolean> {
  if (rows.length === 0) return true;
  const { error } = await supabase.from('email_log').insert(rows);
  if (error) {
    console.error('send-targeted-message: failed to record email delivery history');
    return false;
  }
  return true;
}

export function emailFields(
  audience: EmailAudience | null,
  sent = 0,
  failed = 0,
  logFailed = false
) {
  if (!audience) return {};
  return {
    email_recipients: audience.recipients.length,
    email_sent: sent,
    email_failed: failed,
    email_missing: audience.missing,
    ...(logFailed ? { email_log_failed: true } : {}),
  };
}
