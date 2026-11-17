// The PostgREST side of the confirmation job (MYK9-2088): show_lifecycle_email_jobs rows with
// step_type 'entry_confirmation', claimed through claim_due_auto_email_jobs, the same lease
// MYK9-2124's drain uses. The rules are in entryConfirmationJobs.ts; this file only reads and
// writes the rows.

import {
  CONFIRMATION_JOB_STEP_TYPE,
  type ConfirmationJob,
  type ConfirmationJobAttempt,
  type ConfirmationJobStore,
  type EnqueueOutcome,
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
  entry_id: string | null;
  entry_ids: string[] | null;
  enrollment_id: string | null;
  entry_generations: Record<string, string> | null;
  recipient_email: string | null;
  rendered_subject: string | null;
  rendered_body: string | null;
  idempotency_key: string;
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
    async enqueue(args): Promise<EnqueueOutcome> {
      const { data: existing, error: readError } = await supabase
        .from(JOBS)
        .select('id, status')
        .eq('idempotency_key', args.idempotencyKey)
        .maybeSingle();
      if (readError) fail('Could not read the confirmation job', readError);

      // No text is stored: the body is worked out when the job is sent.
      const text = {
        recipient_email: args.recipientEmail,
        recipient_name: args.recipientName,
        rendered_subject: null,
        rendered_body: null,
        entry_ids: args.entryIds,
        entry_generations: args.generations,
      };

      if (existing) {
        if (existing.status === 'sent') {
          const { data: attempts } = await supabase
            .from(ATTEMPTS)
            .select('resend_message_id')
            .eq('job_id', existing.id)
            .not('resend_message_id', 'is', null)
            .limit(1);
          return { outcome: 'sent', messageId: attempts?.[0]?.resend_message_id ?? null };
        }
        if (existing.status !== 'failed' && existing.status !== 'skipped') {
          return { outcome: 'open' };
        }
        // Ended failed or skipped under the same key (the daily run, or the show's switch back
        // on): due now again, with the lease cleared and the text refreshed.
        const { data, error } = await supabase
          .from(JOBS)
          .update({
            ...text,
            status: 'ready',
            due_at: args.nowIso,
            claimed_until: null,
            attempt_id: null,
            skipped_at: null,
          })
          .eq('id', existing.id)
          .eq('status', existing.status)
          .select('id');
        // Another job holds this exhibitor's one ready slot: it goes first.
        if (isUniqueViolation(error)) return { outcome: 'open' };
        if (error) fail('Could not revive the confirmation job', error);
        return (data ?? []).length > 0 ? { outcome: 'revived' } : { outcome: 'open' };
      }

      const { error } = await supabase.from(JOBS).insert({
        ...text,
        show_id: args.showId,
        step_id: await acceptedStepId(args.showId),
        step_type: CONFIRMATION_JOB_STEP_TYPE,
        status: 'ready',
        recipient_scope: 'show_recipient',
        entry_id: args.entryIds[0] ?? null,
        enrollment_id: args.registrationId,
        idempotency_key: args.idempotencyKey,
        batch_key: args.groupKey,
        due_at: args.nowIso,
        auto_send: true,
      });
      // The same key written by a racing run, or another ready job for this exhibitor.
      if (isUniqueViolation(error)) return { outcome: 'open' };
      if (error) fail('Could not write the confirmation job', error);
      return { outcome: 'created' };
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
        anchorEntryId: row.entry_id ?? row.entry_ids?.[0] ?? '',
        entryIds: row.entry_ids ?? [],
        generations: row.entry_generations ?? {},
        recipientEmail: row.recipient_email ?? '',
        begun:
          row.rendered_body === null
            ? null
            : {
                to: row.recipient_email ?? '',
                subject: row.rendered_subject ?? '',
                html: row.rendered_body,
              },
        idempotencyKey: row.idempotency_key,
        dueAt: row.due_at,
      }));
    },

    async loadAttempts(jobId): Promise<ConfirmationJobAttempt[]> {
      const { data, error } = await supabase
        .from(ATTEMPTS)
        .select('attempted_at, email_log_id, resend_message_id, status')
        .eq('job_id', jobId);
      if (error) fail('Could not read the confirmation attempts', error);
      return (
        (data ?? []) as Array<{
          attempted_at: string;
          email_log_id: string | null;
          resend_message_id: string | null;
          status: string;
        }>
      ).map(row => ({
        attemptedAt: row.attempted_at,
        emailLogId: row.email_log_id,
        resendMessageId: row.resend_message_id,
        status: row.status,
      }));
    },

    async beginSend(job, payload) {
      const { data, error } = await supabase
        .from(JOBS)
        .update({
          recipient_email: payload.to,
          rendered_subject: payload.subject,
          rendered_body: payload.html,
        })
        .eq('id', job.id)
        .eq('attempt_id', job.attemptId)
        .select('id');
      if (error) fail('Could not store the confirmation about to be sent', error);
      // The lease was lost: another run owns the job now, so this one must not send.
      if ((data ?? []).length === 0) throw new Error('The confirmation lease was lost');
    },

    async recordAttempt(job, attempt) {
      const { error } = await supabase.from(ATTEMPTS).insert({
        job_id: job.id,
        resend_message_id: attempt.messageId,
        status: attempt.status,
        error_message: attempt.error,
      });
      // Not swallowed: an accepted send with no attempt row cannot be reconciled by message id.
      if (error) fail('Could not record the confirmation attempt', error);
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

    async releaseLease(job, untilIso, keepBegun) {
      const { error } = await supabase
        .from(JOBS)
        .update({
          attempt_id: null,
          claimed_until: untilIso,
          ...(keepBegun ? {} : { rendered_subject: null, rendered_body: null }),
        })
        .eq('id', job.id)
        .eq('attempt_id', job.attemptId);
      if (error) fail('Could not release the confirmation lease', error);
    },
  };
}
