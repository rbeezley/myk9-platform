// Pure HTML builder for the club-admin invitation email (MYK9-2211). Split from the handler so
// escaping and link placement can be asserted without a Supabase client.

import { escapeHtml } from '../admin-invite-user/inviteEmail.ts';

export function buildClubAdminInviteHtml({
  clubName,
  inviterName,
  inviteEmail,
  signUpUrl,
  expiresOn,
}: {
  clubName: string;
  inviterName: string | null;
  inviteEmail: string;
  signUpUrl: string;
  expiresOn: string;
}): string {
  const brand = '#2563eb';
  const who = inviterName ? escapeHtml(inviterName) : 'A club admin';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background-color:#f3f4f6;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background-color:${brand};padding:16px 24px;">
      <p style="color:#fff;font-size:20px;font-weight:600;margin:0;">myK9Show</p>
    </div>
    <div style="padding:32px 24px;">
      <h1 style="font-size:24px;margin:0 0 16px;color:#1a1a1e;">You are invited to help run ${escapeHtml(clubName)}</h1>
      <p style="color:#1a1a1e;font-size:16px;line-height:1.6;">
        ${who} invited you to be an admin of ${escapeHtml(clubName)} on myK9Show.
        Create your account with this email address (${escapeHtml(inviteEmail)}) and confirm it.
        You become an admin of the club as soon as your email is confirmed.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${escapeHtml(signUpUrl)}" style="background-color:${brand};color:#fff;padding:12px 32px;border-radius:6px;font-weight:600;text-decoration:none;display:inline-block;">Create your account</a>
      </div>
      <p style="color:#6b7280;font-size:14px;">This invitation expires on ${escapeHtml(expiresOn)}. If you were not expecting it, you can ignore this email.</p>
    </div>
  </div>
</body></html>`;
}
