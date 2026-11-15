// supabase/functions/send-confirmation-email/index.ts
//
// The scheduled exhibitor-email run (pg_cron job 'heritage-confirmation-emails', hourly since
// MYK9-1999). Each run:
//   1. retries failed submit receipts (MYK9-1963), and
//   2. sends every due full confirmation: one email per exhibitor per show once her entry is
//      accepted and its armband exists, card and mail-in alike (fullConfirmationSender.ts). The
//      secretary sets no date; trials.confirmation_date no longer decides anything.
// Called with no body (the cron), or { show_id } to run one show.
//
// Deploy: supabase functions deploy send-confirmation-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

import { requireConfirmationEmailSecret } from './auth.ts';
import {
  sweepFailedReceipts,
  type ReceiptResendOutcome,
  type ReceiptSweepClient,
} from './receiptSweep.ts';
import { sendDueFullConfirmations, type SendResult } from './fullConfirmationSender.ts';
import { createFullConfirmationStore } from './fullConfirmationStore.ts';

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

// ─── Main handler ─────────────────────────────────────────────────────────────

/** Asks send-registration-email to re-send a failed receipt, as the sweep caller (same secret). */
async function resendReceipt(
  req: Request,
  registrationId: string,
  entryIds: string[]
): Promise<ReceiptResendOutcome> {
  const baseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const secret = req.headers.get('x-function-secret');
  if (!baseUrl || !serviceKey || !secret) return 'retry';
  const res = await fetch(`${baseUrl}/functions/v1/send-registration-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
      'x-function-secret': secret,
    },
    body: JSON.stringify({ registrationId, entryIds }),
    // A hung call is that registration's failure (the sweep catches the throw), not the run's.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    await res.text();
    return res.status >= 400 && res.status < 500 ? 'rejected' : 'retry';
  }
  const result = (await res.json()) as { success?: boolean };
  return result.success === true ? 'sent' : 'retry';
}

interface ConfirmationEmailPayload {
  show_id?: string;
}

// auth: 'none' because the caller is pg_cron / pg_net, which passes the service-role key in
// `Authorization: Bearer <key>`: that is not a user JWT, so the envelope's JWT check would fail.
// Caller validation is the required HERITAGE_CONFIRMATION_SECRET header below.
handle<ConfirmationEmailPayload>(
  { auth: 'none', origins: MYK9SHOW_ORIGINS },
  async ({ req, body, supabase }) => {
    requireConfirmationEmailSecret(req);

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      throw new HttpError(503, 'Email service not configured');
    }

    // MYK9-1963: the scheduled run retries failed submit receipts. A call for one show does not.
    const receiptRetry = body?.show_id
      ? undefined
      : await sweepFailedReceipts(
          supabase as unknown as ReceiptSweepClient,
          (registrationId, entryIds) => resendReceipt(req, registrationId, entryIds),
          Date.now()
        );

    const store = createFullConfirmationStore(supabase, {
      today: new Date().toISOString().slice(0, 10),
      onLogError: error => requireEmailLogWrite(error, 'send-confirmation-email'),
      showId: body?.show_id ?? null,
    });

    const confirmations = await sendDueFullConfirmations({
      store,
      siteUrl: Deno.env.get('SITE_URL'),
      send: async (email, idempotencyKey): Promise<SendResult> => {
        const response = await sendResendEmailWithRetry({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({ from: FROM_EMAIL, ...email }),
        });
        if (!response.ok) {
          await response.text();
          console.error('Full confirmation provider error', { status: response.status });
          return { ok: false, error: `provider_http_${response.status}` };
        }
        const result = (await response.json()) as { id?: string };
        return { ok: true, messageId: result.id ?? null };
      },
    });

    return { ...confirmations, receiptRetry };
  }
);
