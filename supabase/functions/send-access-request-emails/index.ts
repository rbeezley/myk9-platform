import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { requireFunctionSecret } from '../_shared/functionSecret.ts';
import { handle } from '../_shared/http/handler.ts';
import { runAccessRequestEmailQueue, type QueueClient } from './worker.ts';

/**
 * send-access-request-emails (MYK9-681) — sends the access-request emails
 * queued in public.access_request_email_jobs.
 *
 * Server-to-server only: the 'access-request-emails' pg_cron job posts here
 * when a job is due, authenticated with ACCESS_REQUEST_EMAIL_CRON_SECRET.
 * The body is ignored; the queue is the input.
 */

const deps = {
  resendApiKey: Deno.env.get('RESEND_API_KEY') ?? null,
  siteUrl: (Deno.env.get('SITE_URL') || 'https://myk9-platform-myk9show.vercel.app').replace(
    /\/+$/,
    ''
  ),
};

handle<unknown>(
  {
    auth: 'none',
    beforeBody: req => requireFunctionSecret(req, 'ACCESS_REQUEST_EMAIL_CRON_SECRET'),
  },
  async ({ supabase }) => await runAccessRequestEmailQueue(supabase as unknown as QueueClient, deps)
);
