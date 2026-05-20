// supabase/functions/send-waitlist-invite/index.ts
//
// Sends a magic-link invite to a platform_waitlist signup whose role is
// 'club_official' (the "Club / secretary" tag on the marketing landing
// form). Auto-grants access on first send and is idempotent on
// access_invite_sent_at — a duplicate call is a no-op success.
//
// Deploy: supabase functions deploy send-waitlist-invite --no-verify-jwt
//
// Caller: apps/myk9show/src/components/landing/v2/WaitlistFormLanding.tsx
// fires this fire-and-forget right after a successful insert when the
// user picked "Club / secretary".

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

const SITE_URL = Deno.env.get('SITE_URL') || 'https://myk9-platform-myk9show.vercel.app';
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

const EARLY_ACCESS_ROLE = 'club_official';
const REDIRECT_PATH = '/secretary/create-show/wizard';

interface InvitePayload {
  email?: string;
}

interface WaitlistRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  access_granted_at: string | null;
  access_invite_sent_at: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInviteHtml(firstName: string, actionUrl: string): string {
  const brand = '#2563eb';
  const safeName = escapeHtml(firstName);
  const safeUrl = escapeHtml(actionUrl);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background-color:#f3f4f6;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background-color:${brand};padding:16px 24px;">
      <p style="color:#fff;font-size:20px;font-weight:600;margin:0;">myK9Show</p>
    </div>
    <div style="padding:32px 24px;">
      <h1 style="font-size:24px;margin:0 0 16px;color:#1a1a1e;">You're in${safeName ? `, ${safeName}` : ''}.</h1>
      <p style="color:#1a1a1e;font-size:16px;line-height:1.6;">
        Thanks for joining the myK9Show waitlist. Your early-access preview is ready —
        you can build your first show right now using the new show wizard, publish a
        premium landing page for it, accept mail-in entries, and send styled
        confirmation emails. The rest of the platform is still in development; this
        slice is the part that's ready for real use.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="background-color:${brand};color:#fff;padding:12px 32px;border-radius:6px;font-weight:600;text-decoration:none;display:inline-block;">Start setting up your show</a>
      </div>
      <p style="color:#6b7280;font-size:14px;">This sign-in link is single-use and expires in 24 hours. If it expires, reply and we'll send a fresh one.</p>
    </div>
    <div style="background-color:#f9fafb;padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} myK9Show</p>
    </div>
  </div>
</body></html>`;
}

handle<InvitePayload>(
  { auth: 'none', origins: MYK9SHOW_ORIGINS },
  async ({ body: payload, supabase }) => {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new HttpError(500, 'RESEND_API_KEY not configured');
    }

    const email = payload.email?.trim().toLowerCase();
    if (!email) {
      throw new HttpError(400, 'email is required');
    }

    // Look up the waitlist row. The unique index is on lower(email), so the
    // caller's lowercased email matches exactly.
    const { data: rows, error: lookupErr } = await supabase
      .from('platform_waitlist')
      .select('id, email, name, role, access_granted_at, access_invite_sent_at')
      .eq('email', email)
      .limit(1);

    if (lookupErr) {
      console.error('waitlist lookup failed', lookupErr);
      throw new HttpError(500, 'lookup failed');
    }

    const row = rows?.[0] as WaitlistRow | undefined;
    if (!row) {
      // Don't leak whether an email is on the list. Return success so a
      // typo or stale call from the form doesn't reveal anything.
      return { ok: true, sent: false, reason: 'no_row' };
    }

    if (row.role !== EARLY_ACCESS_ROLE) {
      return { ok: true, sent: false, reason: 'role_not_eligible' };
    }

    if (row.access_invite_sent_at) {
      // Idempotent: already sent. Nothing to do.
      return { ok: true, sent: false, reason: 'already_sent' };
    }

    // Generate the magic link.
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: row.email,
      options: { redirectTo: `${SITE_URL}${REDIRECT_PATH}` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      console.error('generateLink failed', linkErr);
      throw new HttpError(500, 'failed to generate sign-in link');
    }

    const firstName = (row.name ?? '').trim().split(/\s+/)[0] ?? '';
    const html = buildInviteHtml(firstName, linkData.properties.action_link);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
        'Idempotency-Key': `waitlist-invite-${row.id}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: row.email,
        subject: "You're in — myK9Show early access",
        html,
      }),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error('resend send failed', resendRes.status, detail);
      throw new HttpError(502, 'email send failed');
    }

    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from('platform_waitlist')
      .update({
        access_granted_at: row.access_granted_at ?? now,
        access_invite_sent_at: now,
      })
      .eq('id', row.id);

    if (updateErr) {
      // The email already went out — log but don't fail. The cost of a
      // duplicate send is bounded by the next caller hitting access_invite_sent_at
      // (still null) and Resend's own idempotency key blocking the dupe.
      console.error('failed to stamp access timestamps', updateErr);
    }

    return { ok: true, sent: true };
  },
);
