// supabase/functions/send-auth-email/index.ts
//
// Called by Supabase Auth as a Send Email Hook. The contract requires that
// verified requests return 200 (even on internal failure) so the auth flow
// does not break for users. Signature failures return non-200 so hook
// misconfiguration is loud and unverified payloads never send email.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

import { verifyStandardWebhookSignature } from '../_shared/standardWebhookSignature.ts';
import { persistAuthEmailFailureAlert } from '../_shared/authEmailAlerts.ts';
import { buildAuthActionUrl } from './actionUrl.ts';
import { deliverAuthEmail } from './delivery.ts';
import { buildAuthEmailHtml, type AuthEmailActionType } from './template.ts';

const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

interface AuthHookPayload {
  user: {
    email: string;
    user_metadata?: { first_name?: string };
  };
  email_data: {
    token_hash: string;
    redirect_to: string;
    email_action_type: AuthEmailActionType;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const bodyText = await req.text();
  const verification = await verifyStandardWebhookSignature({
    headers: req.headers,
    body: bodyText,
    secret: Deno.env.get('SEND_EMAIL_HOOK_SECRET'),
  });

  if (!verification.ok) {
    return Response.json(
      { error: verification.message ?? 'Invalid signature' },
      { status: verification.status }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('send-auth-email: missing Supabase configuration');
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  let payload: AuthHookPayload;
  try {
    payload = JSON.parse(bodyText) as AuthHookPayload;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const resendApiKey = Deno.env.get('RESEND_API_KEY');

  try {
    const { user, email_data } = payload;

    const firstName = user.user_metadata?.first_name || 'there';
    const callbackUrl = buildAuthActionUrl(siteUrl, {
      tokenHash: email_data.token_hash,
      actionType: email_data.email_action_type,
      redirectTo: email_data.redirect_to || undefined,
    });

    const { subject, html } = buildAuthEmailHtml(
      email_data.email_action_type,
      firstName,
      callbackUrl
    );

    await deliverAuthEmail(
      {
        actionType: email_data.email_action_type,
        recipientEmail: user.email,
        subject,
        html,
        fromEmail: FROM_EMAIL,
        resendApiKey,
      },
      {
        writeEmailLog: record => supabase.from('email_log').insert(record),
        persistFailureAlert: alert => persistAuthEmailFailureAlert(supabase, alert),
      }
    );
  } catch (err) {
    // Always swallow errors so the auth flow completes.
    console.error('send-auth-email error:', err);
  }

  // Keep the post-verification auth hook contract permissive so auth flow completes.
  return Response.json({ success: true }, { status: 200 });
});
