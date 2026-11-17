import type { LifecycleEmailSupabaseClient, QueryResult } from './lifecycle-email-shared.ts';
import { HttpError } from '../_shared/http/responses.ts';

/**
 * "Send again" for automatic jobs that ended at `failed` after repeated provider refusals
 * (MYK9-2124). Puts this show's failed automatic jobs back to `ready`, due now, with no
 * lease; the next drain sends them. Compare on status = 'failed', so a job the drain has
 * moved on is left alone. The caller has already passed the same show-official check as `send`.
 */
export async function retryAutoJobs(args: {
  supabase: LifecycleEmailSupabaseClient;
  showId: string;
}): Promise<{ retried: number }> {
  const { data, error } = (await args.supabase
    .from('show_lifecycle_email_jobs')
    .update({
      status: 'ready',
      due_at: new Date().toISOString(),
      attempt_id: null,
      claimed_until: null,
    })
    .eq('show_id', args.showId)
    .eq('auto_send', true)
    .eq('status', 'failed')
    .select('id')) as QueryResult<Array<{ id: string }>>;
  if (error) throw new HttpError(500, 'Failed to retry automatic emails');
  return { retried: data?.length ?? 0 };
}
