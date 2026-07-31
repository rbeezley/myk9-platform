// supabase/functions/admin-invite-user/index.ts
//
// Invites a staff account created from /admin/users → "Create User".
// Site-admin gated. See inviteUserHandler.ts for the full rationale.
//
// Deploy: supabase functions deploy admin-invite-user --project-ref sojmvhhwsjxmfistvzbe
//
// Caller: apps/myk9show/src/components/admin/users/CreateUserDialog.tsx

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { inviteUserHandler, type InviteUserRequest } from './inviteUserHandler.ts';

const SITE_URL = Deno.env.get('SITE_URL') || 'https://myk9-platform-myk9show.vercel.app';
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

handle<InviteUserRequest>({ auth: 'jwt', origins: MYK9SHOW_ORIGINS }, ctx =>
  inviteUserHandler(ctx, {
    resendApiKey: Deno.env.get('RESEND_API_KEY'),
    siteUrl: SITE_URL,
    fromEmail: FROM_EMAIL,
    sendEmail: sendResendEmailWithRetry,
  })
);
