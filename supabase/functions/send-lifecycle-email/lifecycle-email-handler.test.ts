import { describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';
import { baseTables, makeSupabase, readyJob } from './lifecycle-email-handler.testUtils';

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

  it('retries a transient provider response without duplicating the business action', async () => {
    const { supabase, calls } = makeSupabase(baseTables());
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('unavailable', { status: 503, headers: { 'Retry-After': '0' } })
      )
      .mockResolvedValueOnce(Response.json({ id: 'resend-after-retry' }));
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: { action: 'send', show_id: 'show-1', job_ids: ['job-1'] },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init.headers).get('Idempotency-Key')).toBe('idem-job-1');
    }
    expect(
      calls.filter(call => call.table === 'email_log' && call.action === 'insert')
    ).toHaveLength(1);
    expect(
      calls.filter(call => call.table === 'show_lifecycle_email_jobs' && call.action === 'update')
    ).toHaveLength(1);
  });

  it('records one failed business outcome after exhausting transient retries', async () => {
    const { supabase, calls } = makeSupabase(baseTables());
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('unavailable-1', { status: 503, headers: { 'Retry-After': '0' } })
      )
      .mockResolvedValueOnce(
        new Response('unavailable-2', { status: 503, headers: { 'Retry-After': '0' } })
      )
      .mockResolvedValueOnce(new Response('unavailable-3', { status: 503 }));
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    const result = await handler({
      body: { action: 'send', show_id: 'show-1', job_ids: ['job-1'] },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(result).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init.headers).get('Idempotency-Key')).toBe('idem-job-1');
    }
    expect(
      calls.filter(call => call.table === 'email_log' && call.action === 'insert')
    ).toHaveLength(0);
    expect(
      calls.filter(
        call =>
          call.table === 'show_lifecycle_email_jobs' &&
          call.action === 'update' &&
          (call.value as { status?: string }).status === 'failed'
      )
    ).toHaveLength(1);
    expect(
      calls.filter(
        call => call.table === 'show_lifecycle_email_attempts' && call.action === 'insert'
      )
    ).toHaveLength(1);
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

  it('saves a reviewed decision email with server-derived recipient fields', async () => {
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
        entry_id: 'entry-1',
        enrollment_id: 'reg-1',
        recipient_email: 'tampered@example.com',
        recipient_name: 'Tampered',
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
          entry_id: 'entry-1',
          enrollment_id: 'reg-1',
          recipient_email: 'jamie@example.com',
          recipient_name: 'Jamie Handler',
          idempotency_key: 'idem-ready',
        }),
      })
    );
  });

  it('rejects save_ready when the enrollment does not match the entry', async () => {
    const { supabase } = makeSupabase(baseTables());
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    await expect(
      handler({
        body: {
          action: 'save_ready',
          show_id: 'show-1',
          step_type: 'accepted',
          recipient_scope: 'enrollment',
          entry_id: 'entry-1',
          enrollment_id: 'reg-other',
          recipient_email: 'tampered@example.com',
          recipient_name: 'Tampered',
          subject: 'Entry accepted',
          body: 'You are accepted.',
          secretary_note: '',
          idempotency_key: 'idem-mismatch',
        },
        user: { id: 'secretary-1' },
        supabase,
      })
    ).rejects.toThrow('Lifecycle email enrollment does not match this entry');
    expect(fetch).not.toHaveBeenCalled();
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
        entry_id: 'entry-1',
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

  it('fails save_ready when the ready job insert is rejected', async () => {
    const { supabase } = makeSupabase(baseTables());
    const fetch = vi.fn();
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    await expect(
      handler({
        body: {
          action: 'save_ready',
          show_id: 'show-1',
          step_type: 'accepted',
          recipient_scope: 'enrollment',
          entry_id: 'entry-1',
          enrollment_id: 'reg-1',
          recipient_email: 'jamie@example.com',
          recipient_name: 'Jamie',
          subject: 'Entry accepted',
          body: 'You are accepted.',
          secretary_note: '',
          idempotency_key: 'duplicate',
        },
        user: { id: 'secretary-1' },
        supabase,
      })
    ).rejects.toThrow('Lifecycle email is already saved for review');
    expect(fetch).not.toHaveBeenCalled();
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

  it('reconciles an uncertain failed retry from the latest existing email_log before resending', async () => {
    const { supabase, calls } = makeSupabase(
      baseTables({
        show_lifecycle_email_jobs: [
          { ...readyJob, id: 'job-failed', status: 'failed', idempotency_key: 'idem-failed' },
        ],
        email_log: [
          {
            id: 'email-log-old',
            related_id: 'job-failed',
            status: 'sent',
            resend_message_id: 'resend-old',
            created_at: '2026-07-08T09:00:00.000Z',
          },
          {
            id: 'email-log-latest',
            related_id: 'job-failed',
            status: 'delivered',
            resend_message_id: 'resend-latest',
            created_at: '2026-07-08T10:00:00.000Z',
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
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'show_lifecycle_email_jobs',
          action: 'update',
          value: expect.objectContaining({ email_log_id: 'email-log-latest' }),
        }),
        expect.objectContaining({
          table: 'show_lifecycle_email_attempts',
          action: 'insert',
          value: expect.objectContaining({
            email_log_id: 'email-log-latest',
            resend_message_id: 'resend-latest',
          }),
        }),
      ])
    );
  });
});
