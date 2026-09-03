import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { assertSendEmailAuthorization, assertSendEmailRateLimit } from './authz.ts';
import {
  generateSupportNotificationEmail,
  type SupportNotificationData,
} from './supportNotificationEmail.ts';
import { resolveDerivedRecipient } from './recipientResolution.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';

// Email sender configuration
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

// Types for email data
// Optional CC field shared by all email types
interface WithCc {
  cc?: string[];
}

interface EntryDecisionData extends WithCc {
  type: 'entry_decision';
  to: string;
  exhibitorName: string;
  showName: string;
  showDate: string;
  registrationId?: string;
  message?: string;
  amountDue?: number;
  entries: Array<{
    dogName: string;
    className: string;
    status: 'accepted' | 'not_accepted' | 'waitlisted' | 'withdrawn' | 'missing_info' | 'pending';
    armbandNumber?: string;
  }>;
}

type EmailData = EntryDecisionData | SupportNotificationData;

handle<EmailData>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body: data, user, supabase }) => {
    // Check for API key
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      throw new HttpError(503, 'Email service not configured');
    }

    // Validate required fields
    if (!data.to || !data.type) {
      throw new HttpError(400, 'Missing required fields: to, type');
    }

    if (!user) {
      throw new HttpError(401, 'Unauthorized');
    }

    await assertSendEmailRateLimit({ supabase, userId: user.id });
    const authzResult = await assertSendEmailAuthorization({ supabase, user, data });

    // Generate email content based on type
    let subject: string;
    let html: string;

    switch (data.type) {
      case 'entry_decision':
        subject = `Entry Decisions - ${data.showName}`;
        html = generateEntryDecisionEmail(data);
        break;

      case 'support_notification':
        subject = `Support update: ${data.ticketSubject}`;
        html = generateSupportNotificationEmail(data);
        break;

      default:
        throw new HttpError(400, `Unknown email type: ${(data as EmailData).type}`);
    }

    // For message types whose recipient must be derived from the referenced
    // resource (SA-018/SA-019), resolve it from the authz result rather than
    // trusting body `to`/`cc`. A missing/unresolvable resource email fails
    // closed — no send, no fallback to the body-supplied address.
    let recipient: string;
    let cc: string[] | undefined;
    if (data.type === 'support_notification' || data.type === 'entry_decision') {
      if (!authzResult || authzResult.type !== data.type) {
        console.error('send-email: missing derived-recipient authz result', data.type);
        throw new HttpError(500, 'Failed to resolve email recipient');
      }
      const resolved = resolveDerivedRecipient(authzResult);
      if (!resolved) {
        if (data.type === 'entry_decision' && authzResult.type === 'entry_decision') {
          const { error: logError } = await supabase.from('email_log').insert({
            recipient_email: null,
            email_type: data.type,
            related_id: data.registrationId ?? null,
            status: 'failed',
            error_message: 'recipient_unresolved',
            show_id: authzResult.registration.show.id,
            status_updated_at: new Date().toISOString(),
          });
          requireEmailLogWrite(logError, 'send-email entry-decision');
        }
        throw new HttpError(
          422,
          'Unable to determine the email recipient for this resource',
          'recipient_unresolved'
        );
      }
      recipient = resolved.to;
      // cc is server-derived (e.g. secretary cc for entry_decision); body cc
      // stays ignored for these types.
      cc = resolved.cc?.length ? resolved.cc : undefined;
    } else {
      recipient = data.to;
      cc = data.cc?.length ? data.cc : undefined;
    }

    const resendPayload = {
      from: FROM_EMAIL,
      to: recipient,
      subject,
      html,
      ...(cc ? { cc } : {}),
    };

    // Send email via Resend
    let response: Response;
    try {
      response = await sendResendEmailWithRetry({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify(resendPayload),
      });
    } catch {
      if (data.type === 'entry_decision' && authzResult?.type === 'entry_decision') {
        const { error: logError } = await supabase.from('email_log').insert({
          recipient_email: recipient,
          email_type: data.type,
          related_id: data.registrationId ?? null,
          status: 'failed',
          error_message: 'email_delivery_error',
          show_id: authzResult.registration.show.id,
          status_updated_at: new Date().toISOString(),
        });
        requireEmailLogWrite(logError, 'send-email entry-decision');
      }
      throw new HttpError(502, 'Failed to send email');
    }

    if (!response.ok) {
      await response.text();
      if (data.type === 'entry_decision' && authzResult?.type === 'entry_decision') {
        const { error: logError } = await supabase.from('email_log').insert({
          recipient_email: recipient,
          email_type: data.type,
          related_id: data.registrationId ?? null,
          status: 'failed',
          error_message: `provider_http_${response.status}`,
          show_id: authzResult.registration.show.id,
        });
        requireEmailLogWrite(logError, 'send-email entry-decision');
      }
      throw new HttpError(500, 'Failed to send email');
    }

    const result = await response.json();
    console.log(`Email sent successfully: ${result.id}`);

    // Log the email in the database for tracking
    const logRow: Record<string, unknown> = {
      recipient_email: recipient,
      email_type: data.type,
      resend_message_id: result.id,
      status: 'sent',
    };
    if ('registrationId' in data && data.registrationId) {
      logRow.related_id = data.registrationId;
    }
    if ('ticketId' in data && data.ticketId) {
      logRow.related_id = data.ticketId;
    }
    if (data.type === 'entry_decision' && authzResult?.type === 'entry_decision') {
      logRow.show_id = authzResult.registration.show.id;
    }
    const { error: logError } = await supabase.from('email_log').insert(logRow);
    if (data.type === 'entry_decision') {
      requireEmailLogWrite(logError, 'send-email entry-decision');
    } else if (logError) {
      console.error('send-email: failed to record platform email log', { code: logError.code });
    }

    return { success: true, id: result.id };
  }
);

function generateEntryDecisionEmail(data: EntryDecisionData): string {
  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
    accepted: { bg: '#d1fae5', color: '#065f46', label: 'Accepted' },
    not_accepted: { bg: '#fee2e2', color: '#7f1d1d', label: 'Not Accepted' },
    waitlisted: { bg: '#fef3c7', color: '#78350f', label: 'Waitlisted' },
    withdrawn: { bg: '#f3f4f6', color: '#374151', label: 'Withdrawn' },
    missing_info: { bg: '#fef3c7', color: '#78350f', label: 'Missing Info' },
    pending: { bg: '#f3f4f6', color: '#374151', label: 'Pending' },
  };

  const entriesHtml = data.entries
    .map(e => {
      const s = statusStyles[e.status] ?? statusStyles.pending;
      return `<tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-weight: 500;">${escapeHtml(e.dogName)}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; color: #6b7280;">${escapeHtml(e.className)}</td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; text-align: center;">
        <span style="background-color: ${s.bg}; color: ${s.color}; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600;">${s.label}</span>
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f3f4f6; text-align: right; color: #6b7280; font-size: 14px;">${e.armbandNumber ? `#${escapeHtml(e.armbandNumber)}` : ''}</td>
    </tr>`;
    })
    .join('');

  const hasWaitlisted = data.entries.some(e => e.status === 'waitlisted');
  const hasNotAccepted = data.entries.some(e => e.status === 'not_accepted');
  const hasMissingInfo = data.entries.some(e => e.status === 'missing_info');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px 16px;">
    <div style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="background-color: #1f2937; padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">myK9Show</h1>
      </div>
      <div style="padding: 32px;">
        <p style="margin: 0 0 8px;">Hi ${escapeHtml(data.exhibitorName)},</p>
        <p style="margin: 0 0 24px; color: #6b7280;">Here is the decision for your entries at <strong>${escapeHtml(data.showName)}</strong>${data.showDate ? ` on ${escapeHtml(data.showDate)}` : ''}.</p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Dog</th>
              <th style="text-align: left; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Class</th>
              <th style="text-align: center; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Status</th>
              <th style="text-align: right; padding: 8px 0; border-bottom: 2px solid #e5e7eb; font-size: 13px; color: #6b7280; font-weight: 600;">Armband</th>
            </tr>
          </thead>
          <tbody>${entriesHtml}</tbody>
        </table>
        ${
          data.amountDue !== undefined
            ? `
        <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-top: 20px; border: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; font-size: 15px; color: #1f2937;">Amount Due</span>
          <span style="font-weight: 700; font-size: 18px; color: #1f2937;">$${data.amountDue.toFixed(2)}</span>
        </div>`
            : ''
        }
        ${
          data.message
            ? `
        <div style="background-color: #eff6ff; border-radius: 6px; padding: 16px; margin-top: 16px; border-left: 4px solid #3b82f6;">
          <p style="margin: 0 0 4px; font-weight: 600; font-size: 14px; color: #1e40af;">From the show secretary</p>
          <p style="margin: 0; color: #1e3a5f; font-size: 14px; line-height: 22px; white-space: pre-line;">${escapeHtml(data.message)}</p>
        </div>`
            : ''
        }
        ${hasWaitlisted ? `<p style="color: #6b7280; font-size: 14px; margin-top: 16px;">Waitlisted entries: you'll be notified if a spot opens up.</p>` : ''}
        ${hasNotAccepted ? `<p style="color: #6b7280; font-size: 14px; margin-top: 8px;">If you have questions about an entry that was not accepted, please contact the show secretary.</p>` : ''}
        ${hasMissingInfo ? `<p style="color: #78350f; font-size: 14px; margin-top: 8px;">One or more entries require additional information — please see the secretary's message above.</p>` : ''}
      </div>
      <div style="background-color: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">This email was sent by myK9Show<br>&copy; ${new Date().getFullYear()} myK9Show. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Format cents to currency string
 */
function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
