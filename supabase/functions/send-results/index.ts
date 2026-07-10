// supabase/functions/send-results/index.ts

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import {
  assertSendResultsAuthorization,
  deriveResultsAddresses,
  type SendResultsSupabaseClient,
} from './authz.ts';

// Server-side map: organization:sportType → submission email
// Client cannot override this — prevents email redirection abuse.
const SUBMISSION_EMAILS: Record<string, string> = {
  'AKC:scent_work': 'results@akc.org', // ⚠ confirm actual address before launch
};

const FROM_EMAIL = 'myK9Show <results@myk9show.com>';

interface SendResultsPayload {
  xml: string;
  filename: string;
  organization: string;
  sportType: string;
  // The results' show. Required for the show-official authorization check and
  // to derive cc/reply-to server-side. Any body-supplied cc/reply-to/secretary
  // email is intentionally ignored — the show record is authoritative.
  showId: string;
}

handle<SendResultsPayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('send-results: RESEND_API_KEY not configured');
      throw new HttpError(503, 'Email service not configured');
    }

    const { xml, filename, organization, sportType, showId } = body;

    if (!xml || !filename || !organization || !sportType || !showId) {
      throw new HttpError(
        400,
        'Missing required fields: xml, filename, organization, sportType, showId'
      );
    }

    // Fail-closed: only a show official (secretary/admin) for this show may
    // submit its results. Runs before any config probing or Resend invocation.
    const show = await assertSendResultsAuthorization({
      supabase: supabase as unknown as SendResultsSupabaseClient,
      user,
      showId,
    });

    const toEmail = SUBMISSION_EMAILS[`${organization.toUpperCase()}:${sportType.toLowerCase()}`];

    if (!toEmail) {
      throw new HttpError(400, `No submission email configured for ${organization}:${sportType}`);
    }

    // cc + reply-to are derived from the show record, never the request body.
    const { secretaryEmail } = deriveResultsAddresses(show);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        ...(secretaryEmail ? { cc: [secretaryEmail], reply_to: secretaryEmail } : {}),
        subject: `Electronic Results — ${filename}`,
        html: `<p>Electronic results submission from myK9Show attached.</p>`,
        attachments: [
          {
            filename,
            content: btoa(unescape(encodeURIComponent(xml))),
          },
        ],
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('send-results: Resend error:', errText);
      throw new HttpError(502, 'Failed to send email');
    }

    return { success: true };
  }
);
