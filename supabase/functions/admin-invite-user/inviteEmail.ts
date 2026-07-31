// supabase/functions/admin-invite-user/inviteEmail.ts
//
// Pure HTML builder for the admin invitation email. Split from the handler so
// it can be asserted directly (escaping, link placement) without standing up a
// Supabase client — the same split send-waitlist-invite uses for its template.

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Invitation email body.
 *
 * `roleLabels` is shown to the recipient so the invite explains WHY they are
 * being asked to join — "you have been added as a secretary" reads very
 * differently from an unexplained link, and this is a cold email to someone who
 * may never have heard of the platform.
 */
export function buildAdminInviteHtml({
  firstName,
  actionUrl,
  inviterName,
  roleLabels,
}: {
  firstName: string;
  actionUrl: string;
  inviterName: string;
  roleLabels: string[];
}): string {
  const brand = '#2563eb';
  const safeName = escapeHtml(firstName.trim());
  const safeUrl = escapeHtml(actionUrl);
  const safeInviter = escapeHtml(inviterName.trim());

  const roles = roleLabels
    .map(role => escapeHtml(role.replace(/_/g, ' ')))
    .filter(role => role.length > 0);

  const roleSentence =
    roles.length > 0
      ? `<p style="color:#1a1a1e;font-size:16px;line-height:1.6;">You have been added as <strong>${roles.join(', ')}</strong>.</p>`
      : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background-color:#f3f4f6;">
  <div style="max-width:600px;margin:20px auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background-color:${brand};padding:16px 24px;">
      <p style="color:#fff;font-size:20px;font-weight:600;margin:0;">myK9Show</p>
    </div>
    <div style="padding:32px 24px;">
      <h1 style="font-size:24px;margin:0 0 16px;color:#1a1a1e;">You've been invited${safeName ? `, ${safeName}` : ''}.</h1>
      <p style="color:#1a1a1e;font-size:16px;line-height:1.6;">
        ${safeInviter ? `${safeInviter} has invited you` : 'You have been invited'} to myK9Show,
        the platform clubs use to run dog shows &mdash; entries, running order, scoring and results.
      </p>
      ${roleSentence}
      <p style="color:#1a1a1e;font-size:16px;line-height:1.6;">
        Use the button below to accept the invitation and choose your password.
      </p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${safeUrl}" style="background-color:${brand};color:#fff;padding:12px 32px;border-radius:6px;font-weight:600;text-decoration:none;display:inline-block;">Accept invitation</a>
      </div>
      <p style="color:#6b7280;font-size:14px;">This invitation link is single-use and expires in 24 hours. If it expires, ask the person who invited you to send another.</p>
    </div>
    <div style="background-color:#f9fafb;padding:16px 24px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; ${new Date().getFullYear()} myK9Show</p>
    </div>
  </div>
</body></html>`;
}
