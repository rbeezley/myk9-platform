// MYK9-2211: authorizes and sends one club-admin invitation email.
//
// Authorization and throttling live in the resend_club_admin_invite RPC, called AS THE CALLER (a
// user-scoped client), so the same can_administer_club check that guards inviting guards sending.
// This module only maps the RPC result to an email. Deps are injected so it loads under vitest.

import type { HandlerCtx } from '../_shared/http/handler.ts';
import type { ResendEmailRequestInit } from '../_shared/resendEmail.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { buildClubAdminInviteHtml } from './inviteEmail.ts';

export interface SendClubAdminInviteRequest {
  inviteId?: string;
}

export interface PreparedInviteSend {
  invite_email: string;
  club_name: string;
  inviter_name: string | null;
  expires_at: string;
  /** The one-time token for this send; only its hash is stored. */
  invite_token: string;
}

export interface InviteSendDeps {
  resendApiKey: string | undefined;
  siteUrl: string;
  fromEmail: string;
  sendEmail: (init: ResendEmailRequestInit) => Promise<Response>;
  /** Calls resend_club_admin_invite as the caller. */
  prepareSend: (inviteId: string) => Promise<{
    data: PreparedInviteSend[] | null;
    error: { code?: string; message?: string; hint?: string } | null;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendClubAdminInviteHandler(
  { body }: Pick<HandlerCtx<SendClubAdminInviteRequest>, 'body'>,
  deps: InviteSendDeps
): Promise<{ ok: true; sentTo: string }> {
  if (!deps.resendApiKey) throw new HttpError(503, 'Email service not configured');

  const inviteId = body?.inviteId;
  if (!inviteId || !UUID_RE.test(inviteId)) throw new HttpError(400, 'inviteId is required');

  const { data, error } = await deps.prepareSend(inviteId);
  if (error) {
    if (error.code === '42501') throw new HttpError(403, 'Not allowed to send this invite');
    // The RPC's HINT (expired, cap, throttled, inactive) rides along as the body's `code` so the
    // page can say the real reason.
    if (error.code === 'P0001') {
      throw new HttpError(409, error.message ?? 'Invite cannot be sent', error.hint || undefined);
    }
    throw new HttpError(500, 'Could not prepare the invite');
  }
  const row = data?.[0];
  if (!row) throw new HttpError(500, 'Could not prepare the invite');

  const expiresOn = new Date(row.expires_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const html = buildClubAdminInviteHtml({
    clubName: row.club_name,
    inviterName: row.inviter_name,
    inviteEmail: row.invite_email,
    acceptUrl: `${deps.siteUrl.replace(/\/$/, '')}/club-invite/${encodeURIComponent(row.invite_token)}`,
    expiresOn,
  });

  const response = await deps.sendEmail({
    method: 'POST',
    headers: {
      Authorization: `Bearer ${deps.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: deps.fromEmail,
      to: [row.invite_email],
      subject: `You are invited to help run ${row.club_name} on myK9Show`,
      html,
    }),
  });
  if (!response.ok) throw new HttpError(502, 'The email provider refused the message');

  return { ok: true, sentTo: row.invite_email };
}
