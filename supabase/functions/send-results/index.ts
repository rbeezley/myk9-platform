// supabase/functions/send-results/index.ts

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

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
  secretaryEmail: string;
}

handle<SendResultsPayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body }) => {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('send-results: RESEND_API_KEY not configured');
      throw new HttpError(503, 'Email service not configured');
    }

    const { xml, filename, organization, sportType, secretaryEmail } = body;

    if (!xml || !filename || !organization || !sportType || !secretaryEmail) {
      throw new HttpError(
        400,
        'Missing required fields: xml, filename, organization, sportType, secretaryEmail'
      );
    }

    const toEmail = SUBMISSION_EMAILS[`${organization.toUpperCase()}:${sportType.toLowerCase()}`];

    if (!toEmail) {
      throw new HttpError(
        400,
        `No submission email configured for ${organization}:${sportType}`
      );
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        cc: [secretaryEmail],
        reply_to: secretaryEmail,
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
  },
);
