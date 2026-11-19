// supabase/functions/send-club-admin-invite-email/index.ts
//
// Sends (or resends) the invitation email for a pending club-admin invite (MYK9-2211). Any signed-in
// caller may reach it, but the resend_club_admin_invite RPC, run as the caller, refuses everyone
// who does not administer the invite's club. See inviteHandler.ts.
//
// Deploy: supabase functions deploy send-club-admin-invite-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
//
// Caller: apps/myk9show/src/services/database/club-memberships/club-admin-invites.ts

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { sendClubAdminInviteHandler, type SendClubAdminInviteRequest } from './inviteHandler.ts';

const SITE_URL = Deno.env.get('SITE_URL') || 'https://myk9-platform-myk9show.vercel.app';
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

handle<SendClubAdminInviteRequest>({ auth: 'jwt', origins: MYK9SHOW_ORIGINS }, ctx => {
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: ctx.req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    }
  );
  return sendClubAdminInviteHandler(ctx, {
    resendApiKey: Deno.env.get('RESEND_API_KEY'),
    siteUrl: SITE_URL,
    fromEmail: FROM_EMAIL,
    sendEmail: sendResendEmailWithRetry,
    prepareSend: async inviteId =>
      await callerClient.rpc('resend_club_admin_invite', { p_invite_id: inviteId }),
  });
});
