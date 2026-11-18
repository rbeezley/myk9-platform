import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { requireFunctionSecret } from '../_shared/functionSecret.ts';
import { runWithSupabase } from './run.ts';

/**
 * remind-registry-deadline: one email, two days before a registry's results deadline, for a
 * Finish the show line that is still open (MYK9-2077).
 *
 * Server-to-server only, called hourly by pg_cron. Shares `PACKET_CRON_SECRET` with the packet
 * functions: same kind of caller, same trust boundary, one fewer secret to rotate.
 */
handle<Record<string, never>>(
  {
    auth: 'none',
    beforeBody: req => requireFunctionSecret(req, 'PACKET_CRON_SECRET'),
  },
  async ({ supabase }) => await runWithSupabase(supabase)
);
