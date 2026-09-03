import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import type { ExpiredWaitlistOffer } from '../_shared/waitlistExpiration.ts';
import type { AlertRowOptions, AlertDeliveryOptions } from '../_shared/alertAdminCore.ts';
import {
  runWithBestEffortCronCheckIn,
  type CronCheckInClient,
} from '../_shared/sentryCronCheckIn.ts';

const MONITOR_SLUG = 'cron-waitlist-expiration';
const CRON_WINDOW_MS = 15 * 60 * 1_000;

interface ExpiredOfferRow extends ExpiredWaitlistOffer {
  class_id: string;
  exhibitor_id: string;
  joined_via: string | null;
}

export async function findExpiredOffers(
  supabase: Pick<SupabaseClient, 'from'>,
  nowIso: string,
  errors: string[]
): Promise<ExpiredOfferRow[]> {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select('id, class_id, exhibitor_id, promoted_entry_id, joined_via')
    .eq('status', 'offered')
    .lt('offer_expires_at', nowIso);
  if (error) errors.push(`Fetch expired: ${error.message}`);
  return data ?? [];
}

type CronResults = { errors: string[] };

class CronWorkFailure extends Error {
  constructor(readonly results: CronResults) {
    super('Waitlist cron state work failed');
  }
}

export async function runMonitoredWaitlistCron<T extends CronResults>(args: {
  client: CronCheckInClient | null;
  work: () => Promise<T>;
  alert: (
    subject: string,
    html: string,
    options: AlertRowOptions & AlertDeliveryOptions
  ) => Promise<void>;
  headers?: Record<string, string>;
  now?: () => Date;
  logger?: Pick<Console, 'warn' | 'error'>;
}): Promise<Response> {
  const now = args.now ?? (() => new Date());
  const logger = args.logger ?? console;
  const startedAt = now();
  const headers = { ...args.headers, 'Content-Type': 'application/json' };
  try {
    const results = await runWithBestEffortCronCheckIn(
      args.client,
      MONITOR_SLUG,
      async () => {
        const result = await args.work();
        // The shared monitor marks thrown work as failed. Keep retryable delivery
        // errors separate: they must not turn completed state work into a failure.
        if (result.errors.length) throw new CronWorkFailure(result);
        return result;
      },
      { logger }
    );
    return new Response(
      JSON.stringify({ success: true, timestamp: now().toISOString(), results }),
      {
        status: 200,
        headers,
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errors = error instanceof CronWorkFailure ? error.results.errors : [message];
    logger.error('Waitlist cron failed:', errors);
    const windowStart = new Date(Math.floor(startedAt.getTime() / CRON_WINDOW_MS) * CRON_WINDOW_MS);
    try {
      await args.alert(
        'Waitlist expiration cron failed',
        '<p>Waitlist state work failed. Review the operator alert details and cron logs.</p>',
        {
          source: MONITOR_SLUG,
          severity: 'error',
          dedupeKey: `waitlist-expiration:${windowStart.toISOString()}`,
          skipEmailOnDuplicate: true,
          detail: { errors },
        }
      );
    } catch (alertError) {
      logger.warn('Waitlist cron alert failed:', alertError);
    }
    const body =
      error instanceof CronWorkFailure
        ? { success: false, timestamp: now().toISOString(), results: error.results }
        : { success: false, error: message };
    return new Response(JSON.stringify(body), { status: 500, headers });
  }
}
