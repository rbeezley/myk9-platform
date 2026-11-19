import { describe, expect, it, vi } from 'vitest';
import { drainAutoEmailJobs } from './lifecycle-email-autoSend';
import { renderShowChangedEmail } from './lifecycle-email-showChanged';
import { autoJob, makeAutoSendSupabase, publishedShow } from './lifecycle-email-autoSend.testUtils';

function okFetch(id = 'resend-1') {
  return vi.fn(async () => ({ ok: true, json: async () => ({ id }) }));
}

function drain(
  fixture: ReturnType<typeof makeAutoSendSupabase>,
  fetch: ReturnType<typeof vi.fn>,
  timeBudgetMs?: number
) {
  return drainAutoEmailJobs({
    deps: { fetch: fetch as unknown as typeof globalThis.fetch, resendApiKey: 'resend-key' },
    supabase: fixture.supabase,
    now: () => fixture.clock.at,
    ...(timeBudgetMs === undefined ? {} : { timeBudgetMs }),
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

  it('sends show_changed to the current address and skips when none is left', async () => {
    const moved = makeAutoSendSupabase(
      {
        shows: [publishedShow],
        show_lifecycle_email_jobs: [autoJob()],
        people: [{ id: 'person-1', email: 'jamie.new@example.com', deleted_at: null }],
      },
      { liveEntryPeople: ['person-1'] }
    );
    const movedFetch = okFetch();
    await drain(moved, movedFetch);
    const [, init] = movedFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect((JSON.parse(String(init.body)) as { to: string }).to).toBe('jamie.new@example.com');

    const gone = makeAutoSendSupabase(
      {
        shows: [publishedShow],
        show_lifecycle_email_jobs: [autoJob()],
        people: [{ id: 'person-1', email: null, deleted_at: null }],
      },
      { liveEntryPeople: ['person-1'] }
    );
    const goneFetch = okFetch();
    await expect(drain(gone, goneFetch)).resolves.toMatchObject({ skipped: 1, sent: 0 });
    expect(goneFetch).not.toHaveBeenCalled();
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

  it('waits 5 minutes, 15 minutes, 1 hour and 3 hours after the first four refusals, then fails on the fifth', async () => {
    const fixture = makeAutoSendSupabase(
      { shows: [publishedShow], show_lifecycle_email_jobs: [autoJob()] },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = vi.fn(async () => ({ ok: false, status: 422, text: async () => 'refused' }));
    const minute = 60_000;
    let at = fixture.clock.at.getTime();

    for (const [index, wait] of [5, 15, 60, 180].entries()) {
      fixture.clock.at = new Date(at);
      expect(await drain(fixture, fetch)).toMatchObject({ claimed: 1, retry: 1, failed: 0 });
      // The job waits out the delay, so nothing takes it before then, this run's loop included.
      expect(job(fixture)).toMatchObject({
        status: 'ready',
        attempt_id: null,
        claimed_until: new Date(at + wait * minute).toISOString(),
      });
      fixture.clock.at = new Date(at + wait * minute - 1000);
      expect(
        await drain(fixture, fetch),
        `one second early after refusal ${index + 1}`
      ).toMatchObject({ claimed: 0 });
      at += wait * minute;
    }

    fixture.clock.at = new Date(at);
    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 1, retry: 0, failed: 1 });
    expect(job(fixture)).toMatchObject({ status: 'failed', attempt_id: null });
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(fixture.tables.show_lifecycle_email_attempts).toHaveLength(5);
    // One Delivery history line for the final refusal: the log row, with its attempt tied to it.
    expect(fixture.tables.email_log).toEqual([
      expect.objectContaining({ status: 'failed', show_id: 'show-1', related_id: 'job-1' }),
    ]);
    const logId = fixture.tables.email_log[0].id;
    expect(
      fixture.tables.show_lifecycle_email_attempts.map(attempt => attempt.email_log_id)
    ).toEqual([null, null, null, null, logId]);

    // A failed job is never claimed again.
    fixture.clock.at = new Date(at + 24 * 60 * minute);
    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 0 });
  });

  it('counts only refusals since the job last became due', async () => {
    const refused = (attemptedAt: string) => ({
      job_id: 'job-1',
      status: 'failed',
      attempted_at: attemptedAt,
      resend_message_id: null,
      email_log_id: null,
    });
    const fixture = makeAutoSendSupabase(
      {
        shows: [publishedShow],
        // Five old refusals, then a new edit moved due_at to 11:55.
        show_lifecycle_email_jobs: [autoJob()],
        show_lifecycle_email_attempts: [
          refused('2026-11-17T09:00:00.000Z'),
          refused('2026-11-17T09:05:00.000Z'),
          refused('2026-11-17T09:20:00.000Z'),
          refused('2026-11-17T10:20:00.000Z'),
          refused('2026-11-17T10:30:00.000Z'),
        ],
      },
      { liveEntryPeople: ['person-1'] }
    );
    const fetch = okFetch();

    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps claiming batches in one run until nothing is due', async () => {
    const jobs = Array.from({ length: 30 }, (_, index) =>
      autoJob({
        id: `job-${index}`,
        recipient_person_id: `person-${index}`,
        recipient_email: `p${index}@example.com`,
        idempotency_key: `key-${index}`,
      })
    );
    const fixture = makeAutoSendSupabase(
      {
        shows: [publishedShow],
        show_lifecycle_email_jobs: jobs,
        people: jobs.map(entry => ({
          id: entry.recipient_person_id,
          email: entry.recipient_email,
          deleted_at: null,
        })),
      },
      { liveEntryPeople: jobs.map(entry => String(entry.recipient_person_id)) }
    );
    const fetch = okFetch();

    expect(await drain(fixture, fetch)).toMatchObject({ claimed: 30, sent: 30 });
    expect(fetch).toHaveBeenCalledTimes(30);
    // Two batches of work and the empty claim that ended the run.
    const claims = fixture.rpc.mock.calls.filter(call => call[0] === 'claim_due_auto_email_jobs');
    expect(claims).toHaveLength(3);
  });

  it('stops claiming once the time budget is spent and leaves the rest for the next run', async () => {
    const jobs = Array.from({ length: 30 }, (_, index) =>
      autoJob({
        id: `job-${index}`,
        recipient_person_id: `person-${index}`,
        recipient_email: `p${index}@example.com`,
        idempotency_key: `key-${index}`,
      })
    );
    const fixture = makeAutoSendSupabase(
      {
        shows: [publishedShow],
        show_lifecycle_email_jobs: jobs,
        people: jobs.map(entry => ({
          id: entry.recipient_person_id,
          email: entry.recipient_email,
          deleted_at: null,
        })),
      },
      { liveEntryPeople: jobs.map(entry => String(entry.recipient_person_id)) }
    );
    // Every send takes a minute of the fake clock.
    const fetch = vi.fn(async () => {
      fixture.clock.at = new Date(fixture.clock.at.getTime() + 60_000);
      return { ok: true, json: async () => ({ id: 'resend-1' }) };
    });

    const result = await drain(fixture, fetch, 60_000);

    expect(result).toMatchObject({ claimed: 25, sent: 25 });
    expect(
      fixture.tables.show_lifecycle_email_jobs.filter(entry => entry.status === 'ready')
    ).toHaveLength(5);
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
    fixture.rpc.mockImplementationOnce(async () => ({ data: [], error: null }));
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
    expect(email.body).toContain('https://myk9show.com/exhibitor/entries?show=show-1');
    expect(email.body).not.toMatch(/—/);
  });
});
