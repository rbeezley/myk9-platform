import { describe, expect, it, vi } from 'vitest';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend';
import { renderShowChangedEmail } from './lifecycle-email-showChanged';
import { autoJob, makeAutoSendSupabase, publishedShow } from './lifecycle-email-autoSend.testUtils';

function okFetch(id = 'resend-1') {
  return vi.fn(async () => ({ ok: true, json: async () => ({ id }) }));
}

function drain(fixture: ReturnType<typeof makeAutoSendSupabase>, fetch: ReturnType<typeof vi.fn>) {
  return drainAutoEmailJobs({
    deps: { fetch: fetch as unknown as typeof globalThis.fetch, resendApiKey: 'resend-key' },
    supabase: fixture.supabase,
    now: () => new Date('2026-11-17T12:00:00.000Z'),
  });
}

function job(fixture: ReturnType<typeof makeAutoSendSupabase>) {
  return fixture.tables.show_lifecycle_email_jobs[0];
}

describe('drainAutoEmailJobs', () => {
  it('claims a due job, sends the current dates and address, and records it for Delivery history', async () => {
    const fixture = makeAutoSendSupabase(
      { shows: [publishedShow], show_lifecycle_email_jobs: [autoJob()] },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = okFetch('resend-1');

    const result = await drain(fixture, fetch);

    expect(result).toMatchObject({ claimed: 1, sent: 1, failed: 0, skipped: 0, errors: 0 });
    // The lease is ten minutes from the drain's clock.
    expect(fixture.rpc).toHaveBeenCalledWith('claim_due_auto_email_jobs', {
      p_limit: 25,
      p_lease_until: '2026-11-17T12:10:00.000Z',
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'show-lifecycle-email:show-1:show_changed:person:person-1:abc'
    );
    const sent = JSON.parse(String(init.body)) as { to: string; subject: string; html: string };
    expect(sent.to).toBe('jamie@example.com');
    expect(sent.subject).toBe('Update to Spring Scent Trial');
    expect(sent.html).toContain('Saturday, November 21, 2026');
    expect(sent.html).toContain('12 River Road');
    expect(sent.html).toContain('Fairfield, OH 45014');

    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({
        email_type: 'show_lifecycle_email',
        related_id: 'job-1',
        show_id: 'show-1',
        status: 'sent',
        resend_message_id: 'resend-1',
        recipient_email: 'jamie@example.com',
      }),
    ]);
    expect(fixture.tables.show_lifecycle_email_attempts).toEqual([
      expect.objectContaining({ job_id: 'job-1', status: 'sent', resend_message_id: 'resend-1' }),
    ]);
    expect(job(fixture)).toMatchObject({
      status: 'sent',
      sent_at: '2026-11-17T12:00:00.000Z',
      attempt_id: null,
      claimed_until: null,
      email_log_id: fixture.tables.email_log[0].id,
    });
  });

  it('marks a job sent without sending again when an earlier attempt was accepted by the provider', async () => {
    const fixture = makeAutoSendSupabase(
      {
        shows: [publishedShow],
        show_lifecycle_email_jobs: [autoJob()],
        show_lifecycle_email_attempts: [
          {
            job_id: 'job-1',
            email_log_id: 'log-9',
            resend_message_id: 'resend-earlier',
            status: 'sent',
          },
        ],
      },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = okFetch();

    const result = await drain(fixture, fetch);

    expect(result).toMatchObject({ claimed: 1, reconciled: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(job(fixture)).toMatchObject({ status: 'sent', email_log_id: 'log-9', attempt_id: null });
  });

  it('retries a refused send on the next drain and ends the job at failed on the third refusal', async () => {
    const fixture = makeAutoSendSupabase(
      { shows: [publishedShow], show_lifecycle_email_jobs: [autoJob()] },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = vi.fn(async () => ({ ok: false, status: 422, text: async () => 'refused' }));

    const first = await drain(fixture, fetch);
    expect(first).toMatchObject({ claimed: 1, retry: 1, failed: 0 });
    expect(job(fixture)).toMatchObject({ status: 'ready', attempt_id: null, claimed_until: null });

    const second = await drain(fixture, fetch);
    expect(second).toMatchObject({ claimed: 1, retry: 1, failed: 0 });
    expect(job(fixture).status).toBe('ready');

    const third = await drain(fixture, fetch);
    expect(third).toMatchObject({ claimed: 1, retry: 0, failed: 1 });
    expect(job(fixture)).toMatchObject({ status: 'failed', attempt_id: null });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fixture.tables.show_lifecycle_email_attempts).toHaveLength(3);
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({ status: 'failed', show_id: 'show-1', related_id: 'job-1' }),
    ]);
    // Delivery history lists an attempt without a log row on its own: only the first two do.
    const logId = fixture.tables.email_log[0].id;
    expect(
      fixture.tables.show_lifecycle_email_attempts.map(attempt => attempt.email_log_id)
    ).toEqual([null, null, logId]);

    // A failed job is never claimed again.
    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 0 });
  });

  it('skips the job, sending nothing, when the show is no longer published', async () => {
    const fixture = makeAutoSendSupabase(
      {
        shows: [{ ...publishedShow, status: 'draft' }],
        show_lifecycle_email_jobs: [autoJob()],
      },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = okFetch();

    const result = await drain(fixture, fetch);

    expect(result).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(job(fixture)).toMatchObject({
      status: 'skipped',
      skipped_at: '2026-11-17T12:00:00.000Z',
      attempt_id: null,
    });
    expect(fixture.tables.email_log ?? []).toEqual([]);
  });

  it('skips the job when the show was deleted during the quiet minutes', async () => {
    const fixture = makeAutoSendSupabase(
      {
        shows: [{ ...publishedShow, deleted_at: '2026-11-17T11:58:00.000Z' }],
        show_lifecycle_email_jobs: [autoJob()],
      },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = okFetch();

    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(job(fixture).status).toBe('skipped');
  });

  it('skips the job when the secretary switched the step off during the quiet minutes', async () => {
    const fixture = makeAutoSendSupabase(
      {
        shows: [publishedShow],
        show_lifecycle_email_jobs: [autoJob()],
        show_lifecycle_email_steps: [
          { show_id: 'show-1', step_type: 'show_changed', is_enabled: false },
        ],
      },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = okFetch();

    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(job(fixture).status).toBe('skipped');
  });

  it('skips the job when the person no longer has a live entry', async () => {
    const fixture = makeAutoSendSupabase(
      { shows: [publishedShow], show_lifecycle_email_jobs: [autoJob()] },
      { liveEntryPeople: [] }
    );
    const fetch = okFetch();

    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 1, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(job(fixture).status).toBe('skipped');
  });

  it('leaves a job it could not read for the next drain instead of guessing', async () => {
    const fixture = makeAutoSendSupabase(
      { shows: [publishedShow], show_lifecycle_email_jobs: [autoJob()] },
      { liveEntryPeople: ['person-1'] }
    );
    fixture.rpc.mockImplementationOnce(async () => ({
      data: [{ ...autoJob(), job_id: 'job-1', attempt_id: 'attempt-x' }],
      error: null,
    }));
    fixture.rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'boom' } }));
    const fetch = okFetch();

    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 1, errors: 1, sent: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(job(fixture).status).toBe('ready');
  });
});

describe('renderShowChangedEmail', () => {
  it('lists every live trial date and the street address, plainly', () => {
    const email = renderShowChangedEmail({
      show: {
        ...publishedShow,
        trials: [
          ...publishedShow.trials,
          { name: 'Cancelled Trial', date: '2026-11-23', deleted_at: '2026-11-01T00:00:00Z' },
        ],
      },
      recipientName: 'Jamie Handler',
    });

    expect(email.subject).toBe('Update to Spring Scent Trial');
    expect(email.body).toContain('Hi Jamie,');
    expect(email.body).toContain('Saturday Trial: Saturday, November 21, 2026');
    expect(email.body).toContain('Sunday Trial: Sunday, November 22, 2026');
    expect(email.body).not.toContain('November 23');
    expect(email.body).toContain('Riverside Barn\n12 River Road\nFairfield, OH 45014');
    expect(email.body).toContain('https://myk9show.com/exhibitor/entries?showId=show-1');
    expect(email.body).not.toMatch(/—/);
  });
});
