import { describe, expect, it } from 'vitest';
import {
  fetchLifecycleEmailJobsForReview,
  fetchEntryDecisionEmailStatuses,
  fetchShowLifecycleEmailSummary,
  saveLifecycleEmailJobForLater,
  skipLifecycleEmailJobsForReview,
  updateReadyLifecycleEmailJob,
  updateLifecycleEmailStepEnabled,
  type LifecycleEmailFunctionsClient,
  type LifecycleEmailSupabaseClient,
} from './api';

interface TestQueryResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

interface TestQueryBuilder<T> extends PromiseLike<TestQueryResult<T>> {
  select(columns: string): TestQueryBuilder<T>;
  eq(column: string, value: unknown): TestQueryBuilder<T>;
  in(column: string, values: readonly unknown[]): TestQueryBuilder<T>;
  update(values: Record<string, unknown>): TestQueryBuilder<T>;
}

function createClient(tables: Record<string, unknown[]>): {
  client: LifecycleEmailSupabaseClient;
  calls: Array<{ table: string; action: string; values?: Record<string, unknown> }>;
} {
  const calls: Array<{ table: string; action: string; values?: Record<string, unknown> }> = [];
  const client: LifecycleEmailSupabaseClient = {
    from<T = unknown>(table: string) {
      let rows = [...(tables[table] ?? [])];
      const builder: TestQueryBuilder<T> = {
        select(columns: string) {
          calls.push({ table, action: `select:${columns}` });
          return builder;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter(row => (row as Record<string, unknown>)[column] === value);
          return builder;
        },
        in(column: string, values: readonly unknown[]) {
          rows = rows.filter(row => values.includes((row as Record<string, unknown>)[column]));
          return builder;
        },
        update(values: Record<string, unknown>) {
          calls.push({ table, action: 'update', values });
          return builder;
        },
        then<TResult1 = TestQueryResult<T>, TResult2 = never>(
          onfulfilled?: ((value: TestQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
        ): PromiseLike<TResult1 | TResult2> {
          return Promise.resolve({ data: rows as T, error: null }).then(onfulfilled, onrejected);
        },
      };
      return builder;
    },
  };
  return { client, calls };
}

describe('lifecycle email api helpers', () => {
  it('loads summary rows without recipient preview detail', async () => {
    const { client, calls } = createClient({
      show_lifecycle_email_steps: [
        { show_id: 'show-1', step_type: 'two_week_reminder', is_enabled: true },
      ],
      show_lifecycle_email_jobs: [
        {
          show_id: 'show-1',
          step_type: 'two_week_reminder',
          status: 'ready',
          preview_warnings: ['No armband'],
        },
      ],
      email_log: [
        {
          related_id: 'reg-1',
          email_type: 'registration_confirmation',
          status: 'sent',
          error_message: null,
          created_at: '2026-07-08T12:00:00Z',
        },
      ],
    });

    const summary = await fetchShowLifecycleEmailSummary({
      supabase: client,
      showId: 'show-1',
      receiptSources: [{ registrationId: 'reg-1', paymentMethod: 'online' }],
    });

    expect(summary.steps.find(step => step.stepType === 'two_week_reminder')).toMatchObject({
      readyCount: 1,
      warningCount: 1,
    });
    expect(summary.receipts.sentCount).toBe(1);
    expect(calls).toEqual(
      expect.arrayContaining([
        {
          table: 'show_lifecycle_email_jobs',
          action: 'select:step_type, status, preview_warnings',
        },
      ])
    );
  });

  it('updates a step enabled setting by show and step type', async () => {
    const { client, calls } = createClient({ show_lifecycle_email_steps: [] });

    await updateLifecycleEmailStepEnabled({
      supabase: client,
      showId: 'show-1',
      stepType: 'day_before_reminder',
      isEnabled: false,
    });

    expect(calls).toContainEqual({
      table: 'show_lifecycle_email_steps',
      action: 'update',
      values: { is_enabled: false },
    });
  });

  it('loads entry-row ready, sent, and correction lifecycle email state', async () => {
    const { client } = createClient({
      show_lifecycle_email_jobs: [
        {
          id: 'job-ready',
          show_id: 'show-1',
          entry_id: 'entry-1',
          step_type: 'accepted',
          status: 'ready',
          subject: 'Entry accepted',
          body: 'Ready body',
          secretary_note: 'Ready note',
          due_at: '2026-07-08T12:00:00Z',
          prepared_at: '2026-07-08T12:00:00Z',
          sent_at: null,
          correction_for_job_id: null,
        },
        {
          id: 'job-sent',
          show_id: 'show-1',
          entry_id: 'entry-2',
          step_type: 'accepted',
          status: 'sent',
          subject: 'Entry accepted',
          body: 'Sent body',
          secretary_note: null,
          due_at: '2026-07-08T12:00:00Z',
          prepared_at: '2026-07-08T12:00:00Z',
          sent_at: '2026-07-08T12:05:00Z',
          correction_for_job_id: null,
        },
        {
          id: 'job-correction',
          show_id: 'show-1',
          entry_id: 'entry-2',
          step_type: 'accepted',
          status: 'sent',
          subject: 'Correction',
          body: 'Correction body',
          secretary_note: null,
          due_at: '2026-07-08T12:06:00Z',
          prepared_at: '2026-07-08T12:06:00Z',
          sent_at: '2026-07-08T12:10:00Z',
          correction_for_job_id: 'job-sent',
        },
      ],
    });

    const statuses = await fetchEntryDecisionEmailStatuses({
      supabase: client,
      showId: 'show-1',
      entryIds: ['entry-1', 'entry-2'],
    });

    expect(statuses['entry-1']?.readyJob).toMatchObject({
      id: 'job-ready',
      subject: 'Entry accepted',
    });
    expect(statuses['entry-2']?.sentDecisionJob).toMatchObject({ id: 'job-sent' });
    expect(statuses['entry-2']?.sentCorrectionJob).toMatchObject({
      id: 'job-correction',
      correctionForJobId: 'job-sent',
    });
  });

  it('passes correction ids when saving a ready lifecycle email', async () => {
    const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
    const client: LifecycleEmailFunctionsClient = {
      functions: {
        invoke: async (name, options) => {
          calls.push({ name, body: options.body });
          return { data: { jobId: 'job-1' }, error: null };
        },
      },
    };

    const jobId = await saveLifecycleEmailJobForLater({
      supabase: client,
      showId: 'show-1',
      stepType: 'accepted',
      recipientScope: 'enrollment',
      entryId: 'entry-1',
      enrollmentId: 'reg-1',
      recipientEmail: 'jamie@example.com',
      recipientName: 'Jamie',
      subject: 'Correction',
      body: 'Correction body',
      secretaryNote: '',
      idempotencyKey: 'idem-correction',
      correctionForJobId: 'job-original',
    });

    expect(jobId).toBe('job-1');
    expect(calls).toEqual([
      {
        name: 'send-lifecycle-email',
        body: expect.objectContaining({
          action: 'save_ready',
          correction_for_job_id: 'job-original',
          idempotency_key: 'idem-correction',
        }),
      },
    ]);
  });

  it('updates an existing ready lifecycle email draft', async () => {
    const { client, calls } = createClient({ show_lifecycle_email_jobs: [] });

    await updateReadyLifecycleEmailJob({
      supabase: client,
      jobId: 'job-ready',
      subject: 'Edited subject',
      body: 'Edited body',
      secretaryNote: 'Edited note',
    });

    expect(calls).toContainEqual({
      table: 'show_lifecycle_email_jobs',
      action: 'update',
      values: {
        subject: 'Edited subject',
        body: 'Edited body',
        secretary_note: 'Edited note',
      },
    });
  });

  it('marks excluded lifecycle email recipients as skipped', async () => {
    const { client, calls } = createClient({ show_lifecycle_email_jobs: [] });

    await skipLifecycleEmailJobsForReview({
      supabase: client,
      jobIds: ['job-skipped'],
    });

    expect(calls).toContainEqual({
      table: 'show_lifecycle_email_jobs',
      action: 'update',
      values: expect.objectContaining({ status: 'skipped', skipped_at: expect.any(String) }),
    });
  });

  it('loads failed jobs for retry in the batch review list', async () => {
    const { client } = createClient({
      show_lifecycle_email_jobs: [
        {
          id: 'job-ready',
          show_id: 'show-1',
          step_type: 'two_week_reminder',
          status: 'ready',
          recipient_email: 'ready@example.com',
          recipient_name: 'Ready',
          subject: 'Ready subject',
          body: 'Ready body',
          secretary_note: null,
          preview_warnings: [],
        },
        {
          id: 'job-failed',
          show_id: 'show-1',
          step_type: 'two_week_reminder',
          status: 'failed',
          recipient_email: 'failed@example.com',
          recipient_name: 'Failed',
          subject: 'Failed subject',
          body: 'Failed body',
          secretary_note: null,
          preview_warnings: ['Previous send failed.'],
        },
        {
          id: 'job-sent',
          show_id: 'show-1',
          step_type: 'two_week_reminder',
          status: 'sent',
          recipient_email: 'sent@example.com',
          recipient_name: 'Sent',
          subject: 'Sent subject',
          body: 'Sent body',
          secretary_note: null,
          preview_warnings: [],
        },
      ],
    });

    const jobs = await fetchLifecycleEmailJobsForReview({
      supabase: client,
      showId: 'show-1',
      stepType: 'two_week_reminder',
    });

    expect(jobs.map(job => job.id)).toEqual(['job-ready', 'job-failed']);
    expect(jobs[1]).toMatchObject({
      status: 'failed',
      previewWarnings: ['Previous send failed.'],
    });
  });

  it('returns null when saving a ready lifecycle email returns no job id', async () => {
    const client: LifecycleEmailFunctionsClient = {
      functions: {
        invoke: async () => ({ data: { jobId: null }, error: null }),
      },
    };

    await expect(
      saveLifecycleEmailJobForLater({
        supabase: client,
        showId: 'show-1',
        stepType: 'accepted',
        recipientScope: 'enrollment',
        subject: 'Subject',
        body: 'Body',
        secretaryNote: '',
        idempotencyKey: 'idem-empty',
      })
    ).resolves.toBeNull();
  });

  it('throws when saving a ready lifecycle email fails', async () => {
    const client: LifecycleEmailFunctionsClient = {
      functions: {
        invoke: async () => ({ data: null, error: { message: 'duplicate key' } }),
      },
    };

    await expect(
      saveLifecycleEmailJobForLater({
        supabase: client,
        showId: 'show-1',
        stepType: 'accepted',
        recipientScope: 'enrollment',
        subject: 'Subject',
        body: 'Body',
        secretaryNote: '',
        idempotencyKey: 'idem-duplicate',
      })
    ).rejects.toThrow('duplicate key');
  });
});
