// The PostgREST side of the confirmation job (MYK9-2088): show_lifecycle_email_jobs rows with
// step_type 'entry_confirmation', claimed through claim_due_auto_email_jobs, the same lease
// MYK9-2124's drain uses. The rules are in entryConfirmationJobs.ts; this file only reads and
// writes the rows.

import {
  CONFIRMATION_JOB_STEP_TYPE,
  type ConfirmationJob,
  type ConfirmationJobAttempt,
  type ConfirmationJobStore,
  type SentPayload,
} from './entryConfirmationJobs.ts';

/** The slice of the Supabase service client the store touches (the real client satisfies it). */
// deno-lint-ignore no-explicit-any
type Client = { from(table: string): any; rpc(fn: string, args: Record<string, unknown>): any };

const JOBS = 'show_lifecycle_email_jobs';
const ATTEMPTS = 'show_lifecycle_email_attempts';

interface ClaimedRow {
  job_id: string;
  attempt_id: string;
  show_id: string;
  batch_key: string | null;
  enrollment_id: string | null;
  recipient_person_id: string | null;
  due_at: string;
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505';
}

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
}

export function createConfirmationJobStore(supabase: Client): ConfirmationJobStore {
  const stepIds = new Map<string, string>();

  /** The show's 'accepted' step: the secretary's one switch for this email, and the job's step_id. */
  async function acceptedStepId(showId: string): Promise<string> {
    const cached = stepIds.get(showId);
    if (cached) return cached;
    const { data, error } = await supabase
      .from('show_lifecycle_email_steps')
      .select('id')
      .eq('show_id', showId)
      .eq('step_type', 'accepted')
      .maybeSingle();
    if (error) fail('Could not read the acceptance email step', error);
    if (!data?.id) throw new Error(`No acceptance email step for show ${showId}`);
    stepIds.set(showId, data.id);
    return data.id;
  }

  return {
    async enqueue(args) {
      const { error } = await supabase.from(JOBS).insert({
        show_id: args.showId,
        step_id: await acceptedStepId(args.showId),
        step_type: CONFIRMATION_JOB_STEP_TYPE,
        status: 'ready',
        recipient_scope: 'show_recipient',
        // The ticket's grouping inputs: the run's own group key, her registration, or the handler
        // of a handler-only group. No entry set and no text: both are worked out when it is sent.
        batch_key: args.groupKey,
        enrollment_id: args.registrationId,
        recipient_person_id: args.handlerId,
        entry_id: args.anchorEntryId,
        recipient_email: args.recipientEmail,
        recipient_name: args.recipientName,
        idempotency_key: `entry-confirmation-job:${crypto.randomUUID()}`,
        due_at: args.nowIso,
        auto_send: true,
      });
      // Another ready ticket already holds this exhibitor's slot (a racing run, or one in backoff).
      if (isUniqueViolation(error)) return 'open';
      if (error) fail('Could not write the confirmation job', error);
      return 'created';
    },

    async loadReadyGroupKeys(showIds) {
      if (showIds.length === 0) return new Set();
      const { data, error } = await supabase
        .from(JOBS)
        .select('batch_key')
        .in('show_id', showIds)
        .eq('step_type', CONFIRMATION_JOB_STEP_TYPE)
        .eq('status', 'ready');
      if (error) fail('Could not read the waiting confirmation jobs', error);
      return new Set(
        ((data ?? []) as Array<{ batch_key: string | null }>)
          .map(row => row.batch_key)
          .filter((key): key is string => !!key)
      );
    },

    async claimDue(limit, leaseUntilIso): Promise<ConfirmationJob[]> {
      const { data, error } = await supabase.rpc('claim_due_auto_email_jobs', {
        p_limit: limit,
        p_lease_until: leaseUntilIso,
        p_step_types: [CONFIRMATION_JOB_STEP_TYPE],
      });
      if (error) fail('Could not claim confirmation jobs', error);
      return ((data ?? []) as ClaimedRow[]).map(row => ({
        id: row.job_id,
        attemptId: row.attempt_id,
        showId: row.show_id,
        groupKey: row.batch_key ?? '',
        registrationId: row.enrollment_id,
        handlerId: row.recipient_person_id,
        dueAt: row.due_at,
      }));
    },

    async loadAttempts(jobId): Promise<ConfirmationJobAttempt[]> {
      const { data, error } = await supabase
        .from(ATTEMPTS)
        .select('id, attempted_at, email_log_id, resend_message_id, status, payload')
        .eq('job_id', jobId)
        .order('attempted_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) fail('Could not read the confirmation attempts', error);
      return (
        (data ?? []) as Array<{
          id: string;
          attempted_at: string;
          email_log_id: string | null;
          resend_message_id: string | null;
          status: string;
          payload: SentPayload | null;
        }>
      ).map(row => ({
        id: row.id,
        attemptedAt: row.attempted_at,
        emailLogId: row.email_log_id,
        resendMessageId: row.resend_message_id,
        status: row.status,
        payload: row.payload,
      }));
    },

    async beginAttempt(job, payload) {
      const { data, error } = await supabase
        .from(ATTEMPTS)
        .insert({ job_id: job.id, status: 'started', payload })
        .select('id')
        .single();
      // Not swallowed: without the record an ambiguous provider answer could not be replayed.
      if (error || !data?.id) fail('Could not record the confirmation about to be sent', error);
      return data.id as string;
    },

    async resolveAttempt(attemptId, outcome) {
      const { error } = await supabase
        .from(ATTEMPTS)
        .update({
          status: outcome.status,
          resend_message_id: outcome.messageId,
          error_message: outcome.error,
        })
        .eq('id', attemptId);
      // Not swallowed: an accepted send with no recorded message id cannot be reconciled.
      if (error) fail('Could not record the confirmation attempt', error);
    },

    async recordFailedAttempt(job, error) {
      const { error: writeError } = await supabase
        .from(ATTEMPTS)
        .insert({ job_id: job.id, status: 'failed', error_message: error });
      if (writeError) fail('Could not record the confirmation attempt', writeError);
    },

    async finish(job, outcome) {
      const { error } = await supabase
        .from(JOBS)
        .update({
          status: outcome.status,
          ...(outcome.status === 'sent' ? { sent_at: outcome.nowIso } : {}),
          ...(outcome.status === 'skipped' ? { skipped_at: outcome.nowIso } : {}),
          ...(outcome.emailLogId ? { email_log_id: outcome.emailLogId } : {}),
          attempt_id: null,
          claimed_until: null,
        })
        .eq('id', job.id)
        .eq('attempt_id', job.attemptId);
      if (error) fail('Could not record the confirmation outcome', error);
    },

    async releaseLease(job, untilIso) {
      const { error } = await supabase
        .from(JOBS)
        .update({ attempt_id: null, claimed_until: untilIso })
        .eq('id', job.id)
        .eq('attempt_id', job.attemptId);
      if (error) fail('Could not release the confirmation lease', error);
    },

    async defer(job, dueIso) {
      const { error } = await supabase
        .from(JOBS)
        .update({ attempt_id: null, claimed_until: null, due_at: dueIso })
        .eq('id', job.id)
        .eq('attempt_id', job.attemptId);
      if (error) fail('Could not defer the confirmation job', error);
    },
  };
}
