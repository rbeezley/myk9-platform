import { HttpError } from '../_shared/http/responses.ts';
import type {
  LifecycleEmailJobRow,
  LifecycleEmailSupabaseClient,
  QueryResult,
} from './lifecycle-email-shared.ts';

/**
 * MYK9-1974: the server is the one authority on "is this still the decision?". A decision
 * email (acceptance or waitlist) is saved when the decision stood on the secretary's screen,
 * but another operator may have changed the entry since, and her screen may be on another
 * show by then. So each decision job is checked against its entries' CURRENT status when it
 * is sent, whichever path sends it (the automatic send, the preview, a ready job sent later).
 */

/** The entry status each decision step announces. */
const DECIDED_STATUS: Record<string, string> = {
  accepted: 'accepted',
  waitlisted: 'waitlist',
};

const DECIDED_MARKER = ':decided:';

interface DecisionEntryRow {
  id: string;
  entry_status: string | null;
  deleted_at: string | null;
}

/**
 * The entries one decision job covers. Mirrors the app's `coveredEntryIds`
 * (apps/myk9show/src/features/lifecycle-emails/decisionEmail.ts): the covered set lives only
 * in the job's idempotency key, `...:decided:<sorted ids>:<anchor>...`; a single-entry job,
 * or a missing or malformed key, covers just its anchor entry.
 */
export function decisionJobEntryIds(job: LifecycleEmailJobRow): string[] {
  const anchor = job.entry_id;
  if (!anchor) return [];
  const at = job.idempotency_key?.indexOf(DECIDED_MARKER) ?? -1;
  if (at < 0) return [anchor];
  const [idList = ''] = job.idempotency_key.slice(at + DECIDED_MARKER.length).split(':');
  const ids = idList.split(',').filter(Boolean);
  return ids.includes(anchor) ? [...new Set(ids)] : [anchor];
}

function isDecisionJob(job: LifecycleEmailJobRow): boolean {
  return job.step_type in DECIDED_STATUS && !!job.entry_id;
}

/**
 * Reads, in one query and before anything is sent, the current status of every entry the
 * batch's decision jobs cover, and returns the ids of the jobs whose decision was superseded:
 * a covered entry that still exists no longer has the status the email announces.
 *
 * A soft-deleted entry does not supersede (MYK9-1833 accepted that the email still goes after
 * a deletion inside the Undo window). An entry that cannot be read at all stops the whole
 * send with an error, so nothing is sent on a guess and every job stays ready to send again.
 */
export async function findSupersededDecisionJobs(
  supabase: LifecycleEmailSupabaseClient,
  jobs: LifecycleEmailJobRow[]
): Promise<Set<string>> {
  const decisionJobs = jobs.filter(isDecisionJob);
  if (decisionJobs.length === 0) return new Set();
  const entryIds = [...new Set(decisionJobs.flatMap(decisionJobEntryIds))];

  const { data, error } = (await supabase
    .from('entries')
    .select('id, entry_status, deleted_at')
    .in('id', entryIds)) as QueryResult<DecisionEntryRow[]>;
  if (error || !data) {
    throw new HttpError(500, 'Failed to check the entry status for this email');
  }

  const byId = new Map(data.map(row => [row.id, row]));
  const superseded = new Set<string>();
  for (const job of decisionJobs) {
    const announced = DECIDED_STATUS[job.step_type];
    const changed = decisionJobEntryIds(job).some(entryId => {
      const entry = byId.get(entryId);
      // A row the read did not return was removed for good; its job goes with it by cascade,
      // so treat it like a deletion rather than as a change of decision.
      if (!entry || entry.deleted_at) return false;
      return entry.entry_status !== announced;
    });
    if (changed) superseded.add(job.id);
  }
  return superseded;
}

/**
 * Records a superseded job as skipped, with no email and no delivery attempt. Its
 * idempotency key is released (suffixed with the job id): the key is unique across all jobs,
 * so a kept key would silently refuse the email for a later, real return to this decision.
 * The suffix comes after the covered ids, so `decisionJobEntryIds` still reads them. If the
 * write fails the job stays ready and the next send checks it again: nothing is sent either way.
 */
export async function recordSupersededSkip(
  supabase: LifecycleEmailSupabaseClient,
  job: LifecycleEmailJobRow,
  userId: string
): Promise<void> {
  await supabase
    .from('show_lifecycle_email_jobs')
    .update({
      status: 'skipped',
      skipped_at: new Date().toISOString(),
      idempotency_key: `${job.idempotency_key}:superseded:${job.id}`,
      updated_by: userId,
    })
    .eq('id', job.id);
}
