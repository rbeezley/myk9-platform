import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { createLifecycleEmailRoute } from './lifecycle-email-route.ts';
import type { SendLifecycleEmailPayload } from './lifecycle-email-handler.ts';

// auth 'none': the envelope's JWT check would reject the cron's service key. The route
// checks the user's JWT itself for every action except the cron's drain_auto (see
// lifecycle-email-route.ts), so the browser path is unchanged.
//
// Deploy: supabase functions deploy send-lifecycle-email --project-ref sojmvhhwsjxmfistvzbe --no-verify-jwt
const route = createLifecycleEmailRoute({
  fetch,
  resendApiKey: Deno.env.get('RESEND_API_KEY'),
});

handle<SendLifecycleEmailPayload>(
  { auth: 'none', origins: MYK9SHOW_ORIGINS },
  // MYK9-2124 origin: the real SupabaseClient is wider than the route's narrow structural
  // client (its Query type is a hand-written subset), so adapt at this one boundary.
  ctx =>
    route({ ...ctx, supabase: ctx.supabase as unknown as Parameters<typeof route>[0]['supabase'] })
);
