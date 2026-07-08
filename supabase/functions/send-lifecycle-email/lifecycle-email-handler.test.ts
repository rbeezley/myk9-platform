import { describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';

type Row = Record<string, unknown>;

function makeQuery(
  table: string,
  rows: Row[],
  calls: Array<{ table: string; action: string; value?: unknown }>
) {
  let resultRows = [...rows];
  let inserted: unknown;
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      resultRows = resultRows.filter(row => row[column] === value);
      return query;
    }),
    in: vi.fn((column: string, values: readonly unknown[]) => {
      resultRows = resultRows.filter(row => values.includes(row[column]));
      return query;
    }),
    insert: vi.fn((value: unknown) => {
      inserted = value;
      calls.push({ table, action: 'insert', value });
      return query;
    }),
    update: vi.fn((value: unknown) => {
      calls.push({ table, action: 'update', value });
      return query;
    }),
    single: vi.fn(async () => {
      if (table === 'email_log' && inserted) return { data: { id: 'email-log-1' }, error: null };
      if (table === 'show_lifecycle_email_jobs' && inserted) {
        return { data: { id: 'inserted-job-1' }, error: null };
      }
      return { data: resultRows[0] ?? null, error: null };
    }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: resultRows, error: null }).then(resolve),
  };
  return query;
}

function makeSupabase(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; action: string; value?: unknown }> = [];
  return {
    calls,
    supabase: {
      from: vi.fn((table: string) => makeQuery(table, tables[table] ?? [], calls)),
    },
  };
}

const readyJob = {
  id: 'job-1',
  show_id: 'show-1',
  step_type: 'accepted',
  status: 'ready',
  recipient_email: 'jamie@example.com',
  recipient_name: 'Jamie',
  subject: 'Entry accepted',
  body: 'You are accepted.',
  secretary_note: null,
  rendered_subject: null,
  rendered_body: null,
  rendered_secretary_note: null,
  email_log_id: null,
  idempotency_key: 'idem-job-1',
};

function baseTables(overrides: Record<string, Row[]> = {}) {
  return {
    shows: [{ id: 'show-1', club_id: 'club-1' }],
    user_roles: [
      {
        auth_user_id: 'secretary-1',
        is_active: true,
        club_id: 'club-1',
        show_id: null,
        roles: { name: 'trial_secretary' },
      },
    ],
    show_lifecycle_email_steps: [{ id: 'step-1', show_id: 'show-1', step_type: 'accepted' }],
    show_lifecycle_email_jobs: [readyJob],
    ...overrides,
  };
}

describe('send-lifecycle-email handler', () => {
  it('denies callers without a show role before Resend is called', async () => {
    const { supabase } = makeSupabase(baseTables({ user_roles: [] }));
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    await expect(
      handler({
        body: { action: 'send', show_id: 'show-1', job_ids: ['job-1'] },
        user: { id: 'user-1' },
        supabase,
      })
    ).rejects.toThrow('Forbidden: show official role required');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stops cleanly when email service configuration is unavailable', async () => {
    const { supabase } = makeSupabase(baseTables());
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: null,
    });

    await expect(
      handler({
        body: { action: 'send', show_id: 'show-1', job_ids: ['job-1'] },
        user: { id: 'secretary-1' },
        supabase,
      })
    ).rejects.toThrow('Email service not configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends a ready job with the stable idempotency key and links email_log', async () => {
    const { supabase, calls } = makeSupabase(baseTables());
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'resend-1' }),
    }));
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: {
        action: 'send',
        show_id: 'show-1',
        job_ids: ['job-1'],
        subject: 'Reviewed subject',
        body: 'Reviewed body',
        secretary_note: 'Reviewed note',
      },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'idem-job-1' }),
      })
    );
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: 'email_log', action: 'insert' }),
        expect.objectContaining({
          table: 'show_lifecycle_email_jobs',
          action: 'update',
          value: expect.objectContaining({
            status: 'sent',
            rendered_subject: 'Reviewed subject',
            rendered_body: 'Reviewed body',
            rendered_secretary_note: 'Reviewed note',
            email_log_id: 'email-log-1',
          }),
        }),
        expect.objectContaining({ table: 'show_lifecycle_email_attempts', action: 'insert' }),
      ])
    );
  });

  it('previews jobs through the same show authorization path', async () => {
    const { supabase } = makeSupabase(baseTables());
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: {
        action: 'preview',
        show_id: 'show-1',
        job_ids: ['job-1'],
        subject: 'Reviewed subject',
      },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toEqual({
      jobs: [
        expect.objectContaining({
          id: 'job-1',
          recipientEmail: 'jamie@example.com',
          subject: 'Reviewed subject',
          body: 'You are accepted.',
        }),
      ],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('saves a reviewed decision email as a ready job for later', async () => {
    const { supabase, calls } = makeSupabase(baseTables());
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: {
        action: 'save_ready',
        show_id: 'show-1',
        step_type: 'accepted',
        recipient_scope: 'enrollment',
        enrollment_id: 'reg-1',
        recipient_email: 'jamie@example.com',
        recipient_name: 'Jamie',
        subject: 'Entry accepted',
        body: 'You are accepted.',
        secretary_note: 'Please bring a crate.',
        idempotency_key: 'idem-ready',
      },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toEqual({ jobId: 'inserted-job-1' });
    expect(fetch).not.toHaveBeenCalled();
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: 'show_lifecycle_email_jobs',
        action: 'insert',
        value: expect.objectContaining({
          step_id: 'step-1',
          status: 'ready',
          idempotency_key: 'idem-ready',
        }),
      })
    );
  });

  it('links ready correction emails to the originally sent job', async () => {
    const { supabase, calls } = makeSupabase(baseTables());
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: {
        action: 'save_ready',
        show_id: 'show-1',
        step_type: 'accepted',
        recipient_scope: 'enrollment',
        enrollment_id: 'reg-1',
        recipient_email: 'jamie@example.com',
        recipient_name: 'Jamie',
        subject: 'Correction',
        body: 'Please disregard the earlier email.',
        secretary_note: '',
        idempotency_key: 'idem-correction',
        correction_for_job_id: 'job-original',
      },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toEqual({ jobId: 'inserted-job-1' });
    expect(calls).toContainEqual(
      expect.objectContaining({
        table: 'show_lifecycle_email_jobs',
        action: 'insert',
        value: expect.objectContaining({
          correction_for_job_id: 'job-original',
          idempotency_key: 'idem-correction',
        }),
      })
    );
  });

  it('records partial failure outcomes without blocking successful recipients', async () => {
    const { supabase } = makeSupabase(
      baseTables({
        show_lifecycle_email_jobs: [
          readyJob,
          { ...readyJob, id: 'job-2', recipient_email: null, idempotency_key: 'idem-job-2' },
        ],
      })
    );
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'resend-1' }),
    }));
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: { action: 'send', show_id: 'show-1', job_ids: ['job-1', 'job-2'] },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toMatchObject({ attempted: 2, sent: 1, failed: 1 });
  });

  it('retries only ready or failed jobs, not already sent jobs', async () => {
    const { supabase } = makeSupabase(
      baseTables({
        show_lifecycle_email_jobs: [
          { ...readyJob, id: 'job-sent', status: 'sent' },
          { ...readyJob, id: 'job-failed', status: 'failed', idempotency_key: 'idem-failed' },
        ],
      })
    );
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: 'resend-1' }),
    }));
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: { action: 'send', show_id: 'show-1', job_ids: ['job-sent', 'job-failed'] },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reconciles an uncertain failed retry from existing email_log before resending', async () => {
    const { supabase } = makeSupabase(
      baseTables({
        show_lifecycle_email_jobs: [
          { ...readyJob, id: 'job-failed', status: 'failed', idempotency_key: 'idem-failed' },
        ],
        email_log: [
          {
            id: 'email-log-existing',
            related_id: 'job-failed',
            status: 'sent',
            resend_message_id: 'resend-existing',
          },
        ],
      })
    );
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: { action: 'send', show_id: 'show-1', job_ids: ['job-failed'] },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
