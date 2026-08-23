import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { requireFunctionSecret } from '../_shared/functionSecret.ts';
import { runPrintReminder, validateReminderRequest, type ReminderRequest } from './reminderRun.ts';

/**
 * remind-print-trial-packet — chases the one step automation cannot do.
 *
 * Server-to-server only. Shares `PACKET_CRON_SECRET` with
 * `generate-trial-packet`: same feature, same trust boundary, and one fewer
 * secret to rotate.
 */

handle<ReminderRequest>(
  {
    auth: 'none',
    beforeBody: req => requireFunctionSecret(req, 'PACKET_CRON_SECRET'),
  },
  async ({ body, supabase }) => await runPrintReminder(supabase, validateReminderRequest(body))
);
