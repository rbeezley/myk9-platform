import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import {
  createSendAccessRequestEmailHandler,
  type AccessRequestEmailClient,
  type SendAccessRequestEmailPayload,
} from './handler.ts';

const handler = createSendAccessRequestEmailHandler({
  resendApiKey: Deno.env.get('RESEND_API_KEY') ?? null,
  siteUrl: (Deno.env.get('SITE_URL') || 'https://myk9-platform-myk9show.vercel.app').replace(
    /\/+$/,
    ''
  ),
});

handle<SendAccessRequestEmailPayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  ({ body, user, supabase }) =>
    handler({ body, user, supabase: supabase as unknown as AccessRequestEmailClient })
);
