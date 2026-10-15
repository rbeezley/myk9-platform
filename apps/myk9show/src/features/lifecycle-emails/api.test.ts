import { describe, expect, it } from 'vitest';
import {
  fetchLifecycleEmailJobsForReview,
  LifecycleSendPartialError,
  fetchEntryDecisionEmailStatuses,
  fetchShowLifecycleEmailSummary,
  saveLifecycleEmailJobForLater,
  sendLifecycleEmailJobs,
  skipLifecycleEmailJobsForReview,
  updateReadyLifecycleEmailJob,
  updateLifecycleEmailStepEnabled,
  type LifecycleEmailFunctionsClient,
  type LifecycleEmailSupabaseClient,
} from './api';
import { fromAny } from '@total-typescript/shoehorn';
import { ID_CHUNK_SIZE } from '@/utils/chunkIds';

function createClient(
  tables: Record<string, unknown[]>,
  afterPage?: (pageNumber: number) => void
): {
  client: LifecycleEmailSupabaseClient;
  calls: Array<{ table: string; action: string; values?: Record<string, unknown> }>;
  inFilters: Array<{ table: string; column: string; count: number }>;
  reads: Array<{ table: string; order: string | null; gt: unknown; limit: number | null }>;
} {
  const inFilters: Array<{ table: string; column: string; count: number }> = [];
  const reads: Array<{ table: string; order: string | null; gt: unknown; limit: number | null }> =
    [];
  const calls: Array<{ table: string; action: string; values?: Record<string, unknown> }> = [];
  const client = fromAny<LifecycleEmailSupabaseClient, unknown>({
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const read = {
        table,
        order: null as string | null,
        gt: null as unknown,
        limit: null as number | null,
      };
      reads.push(read);
      const builder = {
        select(columns: string) {
          calls.push({ table, action: `select:${columns}` });
          return builder;
        },
        eq(column: string, value: unknown) {
          rows = rows.filter(row => (row as Record<string, unknown>)[column] === value);
          return builder;
        },
        in(column: string, values: readonly unknown[]) {
          inFilters.push({ table, column, count: values.length });
          rows = rows.filter(row => values.includes((row as Record<string, unknown>)[column]));
          return builder;
        },
        order(column: string) {
          read.order = column;
          rows = [...rows].sort((x, y) =>
            String((x as Record<string, unknown>)[column]).localeCompare(
              String((y as Record<string, unknown>)[column])
            )
          );
          return builder;
        },
        gt(column: string, value: unknown) {
          read.gt = value;
          rows = rows.filter(
            row => String((row as Record<string, unknown>)[column]) > String(value)
          );
          return builder;
        },
        limit(count: number) {
          read.limit = count;
          rows = rows.slice(0, count);
          return builder;
        },
        update(values: Record<string, unknown>) {
          calls.push({ table, action: 'update', values });
          return builder;
        },
        then(resolve: (value: { data: unknown[]; error: null }) => void) {
          resolve({ data: rows, error: null });
          if (read.limit !== null && table === 'show_lifecycle_email_jobs') {
            afterPage?.(reads.filter(r => r.table === table && r.limit !== null).length);
          }
        },
      };
      return builder;
    },
  });
  return { client, calls, inFilters, reads };
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
          action: 'select:id, step_type, status, preview_warnings',
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

  it('chunks the status query by entry id, so neither the URL nor the row count grows with the show', async () => {
    const entryIds = Array.from({ length: 500 }, (_, i) => `entry-${i}`);
    const job = (id: string, entryId: string) => ({
      id,
      show_id: 'show-1',
      entry_id: entryId,
      step_type: 'accepted',
      status: 'ready',
      subject: 's',
      body: 'b',
      secretary_note: null,
      due_at: '2026-07-08T12:00:00Z',
      prepared_at: '2026-07-08T12:00:00Z',
      sent_at: null,
      correction_for_job_id: null,
    });
    const { client, inFilters } = createClient({
      show_lifecycle_email_jobs: [job('job-a', 'entry-3'), job('job-b', 'entry-other')],
    });

    const statuses = await fetchEntryDecisionEmailStatuses({
      supabase: client,
      showId: 'show-1',
      entryIds,
    });

    const entryFilters = inFilters.filter(filter => filter.column === 'entry_id');
    expect(entryFilters).toHaveLength(5);
    expect(Math.max(...entryFilters.map(filter => filter.count))).toBeLessThanOrEqual(100);
    expect(entryFilters.reduce((sum, filter) => sum + filter.count, 0)).toBe(500);
    expect(Object.keys(statuses)).toEqual(['entry-3']);
  });

  it('chunks receipt registration ids and skipped job ids so no in-filter grows with the show', async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `id-${i}`);
    const { client, inFilters } = createClient({ email_log: [], show_lifecycle_email_jobs: [] });

    await fetchShowLifecycleEmailSummary({
      supabase: client,
      showId: 'show-1',
      receiptSources: ids.map(id => ({ registrationId: id, paymentMethod: 'online' as const })),
    });
    await skipLifecycleEmailJobsForReview({ supabase: client, jobIds: ids });

    const widest = (table: string, column: string) =>
      Math.max(
        0,
        ...inFilters.filter(f => f.table === table && f.column === column).map(f => f.count)
      );
    expect(widest('email_log', 'related_id')).toBeLessThanOrEqual(100);
    expect(widest('show_lifecycle_email_jobs', 'id')).toBeLessThanOrEqual(100);
    expect(inFilters.filter(f => f.column === 'related_id')).toHaveLength(5);
    expect(inFilters.filter(f => f.column === 'id')).toHaveLength(5);
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

    // Paged reads order on id for stable page boundaries, so the list is id-ordered.
    expect(jobs.map(job => job.id)).toEqual(['job-failed', 'job-ready']);
    expect(jobs[0]).toMatchObject({
      status: 'failed',
      previewWarnings: ['Previous send failed.'],
    });
  });

  it('omits unedited override text so each job keeps its own personalised draft', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const client: LifecycleEmailFunctionsClient = {
      functions: {
        invoke: async (_name, options) => {
          bodies.push(options.body);
          return { data: null, error: null };
        },
      },
    };

    await sendLifecycleEmailJobs({
      supabase: client,
      showId: 'show-1',
      jobIds: ['job-1', 'job-2'],
      subject: null,
      body: null,
      secretaryNote: null,
    });

    expect(bodies[0]).toEqual({
      action: 'send',
      show_id: 'show-1',
      job_ids: ['job-1', 'job-2'],
    });
    expect(bodies[0]).not.toHaveProperty('subject');
    expect(bodies[0]).not.toHaveProperty('body');
    expect(bodies[0]).not.toHaveProperty('secretary_note');
  });

  it('forwards edited override text as an explicit broadcast', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const client: LifecycleEmailFunctionsClient = {
      functions: {
        invoke: async (_name, options) => {
          bodies.push(options.body);
          return { data: null, error: null };
        },
      },
    };

    await sendLifecycleEmailJobs({
      supabase: client,
      showId: 'show-1',
      jobIds: ['job-1', 'job-2'],
      subject: null,
      body: 'The venue has changed.',
      secretaryNote: null,
    });

    expect(bodies[0]).toEqual({
      action: 'send',
      show_id: 'show-1',
      job_ids: ['job-1', 'job-2'],
      body: 'The venue has changed.',
    });
  });

  describe('sendLifecycleEmailJobs chunking (MYK9-1187)', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `job-${i}`);
    const recorder = (failOn?: number) => {
      const bodies: Array<Record<string, unknown>> = [];
      const client: LifecycleEmailFunctionsClient = {
        functions: {
          invoke: async (_name, options) => {
            bodies.push(options.body);
            return failOn === bodies.length
              ? { data: null, error: { message: 'edge down' } }
              : { data: null, error: null };
          },
        },
      };
      return { client, bodies };
    };

    it('sends 2300 ids in ordered chunks, each carrying the override text', async () => {
      const { client, bodies } = recorder();
      await sendLifecycleEmailJobs({
        supabase: client,
        showId: 'show-1',
        jobIds: ids(2300),
        subject: 'S',
        body: 'B',
        secretaryNote: 'N',
      });

      expect(bodies.length).toBeGreaterThanOrEqual(3);
      for (const body of bodies) {
        expect((body.job_ids as string[]).length).toBeLessThanOrEqual(ID_CHUNK_SIZE);
        expect(body).toMatchObject({ subject: 'S', body: 'B', secretary_note: 'N' });
      }
      expect(bodies.flatMap(body => body.job_ids as string[])).toEqual(ids(2300));
    });

    it('stops at the failing chunk and reports how many were sent', async () => {
      const { client, bodies } = recorder(2);
      await expect(
        sendLifecycleEmailJobs({ supabase: client, showId: 'show-1', jobIds: ids(2300) })
      ).rejects.toThrow(
        `Sent ${ID_CHUNK_SIZE} of 2300 emails; the rest are still waiting. Send again to finish.`
      );
      expect(bodies).toHaveLength(2);
    });

    it('counts what the handler reports as sent, not the chunk length', async () => {
      let call = 0;
      const client: LifecycleEmailFunctionsClient = {
        functions: {
          invoke: async () => {
            call += 1;
            return call === 1
              ? { data: { attempted: 100, sent: 95, failed: 5 }, error: null }
              : { data: null, error: { message: 'edge down' } };
          },
        },
      };
      const failure = await sendLifecycleEmailJobs({
        supabase: client,
        showId: 'show-1',
        jobIds: ids(250),
      }).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(LifecycleSendPartialError);
      expect((failure as Error).message).toContain('Sent 95 of 250 emails');
    });

    it('returns sent, failed and total summed across chunks', async () => {
      const client: LifecycleEmailFunctionsClient = {
        functions: {
          invoke: async () => ({ data: { attempted: 100, sent: 95, failed: 5 }, error: null }),
        },
      };
      const result = await sendLifecycleEmailJobs({
        supabase: client,
        showId: 'show-1',
        jobIds: ids(200),
      });
      expect(result).toEqual({ sent: 190, failed: 10, total: 200 });
    });

    it('keeps the plain error when the first chunk fails', async () => {
      const { client } = recorder(1);
      await expect(
        sendLifecycleEmailJobs({ supabase: client, showId: 'show-1', jobIds: ids(5) })
      ).rejects.toThrow('edge down');
    });

    it('sends a small batch as one invoke', async () => {
      const { client, bodies } = recorder();
      await sendLifecycleEmailJobs({ supabase: client, showId: 'show-1', jobIds: ids(5) });
      expect(bodies).toHaveLength(1);
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

  describe('keyset paging past the PostgREST 1000-row cap (MYK9-1187)', () => {
    const JOBS = 'show_lifecycle_email_jobs';
    const idOf = (i: number) => `job-${String(i).padStart(5, '0')}`;
    const jobsFor = (count: number, extra: Record<string, unknown> = {}) =>
      Array.from({ length: count }, (_, i) => ({
        id: idOf(i),
        show_id: 'show-1',
        step_type: 'two_week_reminder',
        status: 'ready',
        preview_warnings: null,
        recipient_email: `r${i}@example.com`,
        ...extra,
      }));
    const jobReads = (reads: ReturnType<typeof createClient>['reads']) =>
      reads.filter(r => r.table === JOBS);
    const review = (client: LifecycleEmailSupabaseClient) =>
      fetchLifecycleEmailJobsForReview({
        supabase: client,
        showId: 'show-1',
        stepType: 'two_week_reminder',
      });

    it('counts every job in the summary, paging by id > last id of the previous page', async () => {
      const { client, reads } = createClient({
        show_lifecycle_email_steps: [
          { show_id: 'show-1', step_type: 'two_week_reminder', is_enabled: true },
        ],
        [JOBS]: jobsFor(2300),
      });

      const summary = await fetchShowLifecycleEmailSummary({ supabase: client, showId: 'show-1' });

      expect(summary.steps.find(step => step.stepType === 'two_week_reminder')?.readyCount).toBe(
        2300
      );
      expect(jobReads(reads)).toEqual([
        { table: JOBS, order: 'id', gt: null, limit: 1000 },
        { table: JOBS, order: 'id', gt: idOf(999), limit: 1000 },
        { table: JOBS, order: 'id', gt: idOf(1999), limit: 1000 },
        { table: JOBS, order: 'id', gt: idOf(2299), limit: 1000 },
      ]);
    });

    it('stops on the first empty page, so a short page costs one extra request', async () => {
      const { client, reads } = createClient({
        show_lifecycle_email_steps: [],
        [JOBS]: jobsFor(3),
      });
      await fetchShowLifecycleEmailSummary({ supabase: client, showId: 'show-1' });
      expect(jobReads(reads)).toHaveLength(2);
    });

    it('makes the empty closing request after exactly 1000 jobs and misses nothing', async () => {
      const { client, reads } = createClient({ [JOBS]: jobsFor(1000) });
      const jobs = await review(client);
      expect(jobs).toHaveLength(1000);
      expect(jobReads(reads)).toEqual([
        { table: JOBS, order: 'id', gt: null, limit: 1000 },
        { table: JOBS, order: 'id', gt: idOf(999), limit: 1000 },
      ]);
    });

    it('returns every ready or failed recipient beyond 1000, exactly once', async () => {
      const { client } = createClient({
        [JOBS]: [
          ...jobsFor(1500),
          ...jobsFor(500, { status: 'failed' }).map(j => ({
            ...j,
            id: j.id.replace('job', 'kob'),
          })),
          ...jobsFor(10, { status: 'sent' }).map(j => ({ ...j, id: j.id.replace('job', 'sjob') })),
        ],
      });

      const jobs = await review(client);

      expect(jobs).toHaveLength(2000);
      expect(new Set(jobs.map(job => job.id)).size).toBe(2000);
    });

    it('skips no job when a low-id job leaves the set after page 1 is served', async () => {
      const table = jobsFor(2300);
      const { client } = createClient({ [JOBS]: table }, page => {
        if (page === 1) table.splice(5, 1); // job-00005 leaves (e.g. sent) mid-read
      });

      const jobs = await review(client);

      // Page 1 already carried job-00005; every later job must still arrive, once.
      expect(jobs.map(j => j.id)).toEqual(jobsFor(2300).map(j => j.id));
      expect(new Set(jobs.map(j => j.id)).size).toBe(jobs.length);
    });

    it('does not duplicate a job when one enters at a lower id after page 1', async () => {
      const table = jobsFor(2300).map(j => ({ ...j, id: j.id.replace('job-', 'job-b') }));
      const { client } = createClient({ [JOBS]: table }, page => {
        if (page === 1) table.push({ ...table[0], id: 'job-a-new' }); // sorts before page 1's rows
      });

      const jobs = await review(client);
      const ids = jobs.map(j => j.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toHaveLength(2300);
      expect(ids).not.toContain('job-a-new');
    });

    it('surfaces a query error from a later page', async () => {
      let call = 0;
      const failing = fromAny<LifecycleEmailSupabaseClient, unknown>({
        from() {
          const builder: Record<string, unknown> = {};
          for (const m of ['select', 'eq', 'in', 'order', 'gt', 'limit'])
            builder[m] = () => builder;
          builder.then = (resolve: (v: unknown) => void) => {
            call += 1;
            resolve(
              call === 1
                ? { data: jobsFor(1000), error: null }
                : { data: null, error: { message: 'boom' } }
            );
          };
          return builder;
        },
      });
      await expect(review(failing)).rejects.toThrow('boom');
    });

    it('throws a clear error instead of looping past the page bound', async () => {
      let call = 0;
      // Always a full page with ever-increasing ids: never ends on its own.
      const stuck = fromAny<LifecycleEmailSupabaseClient, unknown>({
        from(table: string) {
          const builder: Record<string, unknown> = {};
          for (const m of ['select', 'eq', 'in', 'order', 'gt', 'limit'])
            builder[m] = () => builder;
          builder.then = (resolve: (v: unknown) => void) => {
            call += 1;
            resolve({
              data:
                table === JOBS
                  ? Array.from({ length: 1000 }, (_, i) => ({ id: `p${call}-${i}` }))
                  : [],
              error: null,
            });
          };
          return builder;
        },
      });
      await expect(
        fetchShowLifecycleEmailSummary({ supabase: stuck, showId: 'show-1' })
      ).rejects.toThrow(/exceeded 50 pages/);
    });
  });
});
