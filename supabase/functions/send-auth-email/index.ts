// supabase/functions/send-auth-email/index.ts
//
// Called by Supabase Auth as a Send Email Hook. The contract requires that
// verified requests return 200 (even on internal failure) so the auth flow
// does not break for users. Signature failures return non-200 so hook
// misconfiguration is loud and unverified payloads never send email.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

import { verifyStandardWebhookSignature } from '../_shared/standardWebhookSignature.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import {
  persistAuthEmailFailureAlert,
  type AuthEmailFailureCategory,
} from '../_shared/authEmailAlerts.ts';

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
    email_action_type: 'signup' | 'recovery' | 'magiclink';
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAuthEmailHtml(
  type: string,
  firstName: string,
  actionUrl: string
): { subject: string; html: string } {
  const brandColor = '#2563eb';
  const safeFirstName = escapeHtml(firstName);
  const safeActionUrl = escapeHtml(actionUrl);

  const layout = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background-color: ${brandColor}; padding: 16px 24px;">
      <p style="color: #fff; font-size: 20px; font-weight: 600; margin: 0;">myK9Show</p>
    </div>
    <div style="padding: 32px 24px;">
      <h1 style="font-size: 24px; margin: 0 0 16px; color: #1a1a1e;">${title}</h1>
      ${body}
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} myK9Show. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  const button = (text: string) =>
    `<div style="text-align: center; margin: 32px 0;">
      <a href="${safeActionUrl}" style="background-color: ${brandColor}; color: #fff; padding: 12px 32px; border-radius: 6px; font-weight: 600; text-decoration: none; display: inline-block;">${text}</a>
    </div>`;

  if (type === 'recovery') {
    return {
      subject: 'Reset your myK9Show password',
      html: layout(
        'Reset your password',
        `
        <p style="color: #1a1a1e; font-size: 16px;">Hi ${safeFirstName}, we received a request to reset your password. Click the button below to choose a new one.</p>
        ${button('Reset Password')}
        <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email. The link expires in 24 hours.</p>
      `
      ),
    };
  }

  // signup + magiclink
  const isSignup = type === 'signup';
  return {
    subject: isSignup ? 'Confirm your myK9Show email' : 'Sign in to myK9Show',
    html: layout(
      isSignup ? 'Confirm your email' : 'Sign in to myK9Show',
      `<p style="color: #1a1a1e; font-size: 16px;">Hi ${safeFirstName}, ${
        isSignup
          ? 'thanks for signing up for myK9Show. Please confirm your email address to get started.'
          : 'click the button below to sign in.'
      }</p>
      ${button(isSignup ? 'Confirm Email' : 'Sign In')}
      <p style="color: #6b7280; font-size: 14px;">${
        isSignup
          ? "If you didn't create an account, you can safely ignore this email."
          : "If you didn't request this, you can safely ignore this email."
      }</p>`
    ),
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
    const callbackUrl = `${siteUrl}/auth/callback?token_hash=${email_data.token_hash}&type=${email_data.email_action_type}`;

    const { subject, html } = buildAuthEmailHtml(
      email_data.email_action_type,
      firstName,
      callbackUrl
    );

    let resendMessageId: string | undefined;
    let sendStatus = 'sent';
    let errorMessage: string | undefined;
    let failureCategory: AuthEmailFailureCategory = 'unknown';

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      sendStatus = 'failed';
      failureCategory = 'configuration';
      errorMessage = 'RESEND_API_KEY not configured';
    } else {
      try {
        const response = await sendResendEmailWithRetry({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: user.email,
            subject,
            html,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          resendMessageId = result.id;
          console.log(`Auth email sent: ${result.id} to ${user.email}`);
        } else {
          const err = await response.text();
          sendStatus = 'failed';
          failureCategory = response.status === 429 ? 'rate_limited' : 'provider_error';
          errorMessage = err || `Resend API returned ${response.status}`;
          console.error('Resend API error:', err);
        }
      } catch (err) {
        sendStatus = 'failed';
        failureCategory = 'network_error';
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error('Resend fetch error:', err);
      }
    }

    // Write email_log row
    const { error: logError } = await supabase.from('email_log').insert({
      recipient_email: user.email,
      email_type:
        email_data.email_action_type === 'recovery' ? 'password_reset' : 'auth_confirmation',
      resend_message_id: resendMessageId,
      status: sendStatus,
      error_message: errorMessage,
    });

    if (logError) {
      console.error('Failed to write email_log:', logError);
    }

    if (sendStatus === 'failed') {
      try {
        await persistAuthEmailFailureAlert(supabase, {
          actionType: email_data.email_action_type,
          recipientEmail: user.email,
          category: failureCategory,
          errorMessage: errorMessage ?? 'Auth email delivery failed',
        });
      } catch (alertError) {
        console.error('Failed to write auth email operator alert:', alertError);
      }
    }
  } catch (err) {
    // Always swallow errors so the auth flow completes.
    console.error('send-auth-email error:', err);
  }

  // Keep the post-verification auth hook contract permissive so auth flow completes.
  return Response.json({ success: true }, { status: 200 });
});
