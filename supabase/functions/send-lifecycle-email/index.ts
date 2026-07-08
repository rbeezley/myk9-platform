import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import {
  createSendLifecycleEmailHandler,
  type SendLifecycleEmailPayload,
} from './lifecycle-email-handler.ts';

handle<SendLifecycleEmailPayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  createSendLifecycleEmailHandler({
    fetch,
    resendApiKey: Deno.env.get('RESEND_API_KEY'),
  })
);

