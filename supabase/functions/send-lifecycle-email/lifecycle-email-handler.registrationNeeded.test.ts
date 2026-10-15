// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';
import { makeStatefulSupabase } from './lifecycle-email-handler.statefulSupabase';
import { baseTables, makeSupabase, readyJob } from './lifecycle-email-handler.testUtils';

const numberNeededJob = {
  ...readyJob,
  id: 'job-number',
  step_type: 'registration_number_needed',
  entry_id: 'entry-1',
  idempotency_key: 'idem-number',
};

const entryRow = {
  id: 'entry-1',
  show_id: 'show-1',
  registration_id: 'reg-1',
  dog_id: 'dog-1',
  class_id: 'class-1',
  entry_status: 'confirmed',
  deleted_at: null,
  handler: 'Jamie Handler',
};

/**
 * MYK9-1162. `held` is what `entry_awaiting_registration_number` answers for the
 * entry (undefined = the entry is not there; `{ error }` = the call failed). The
 * handler runs with the SERVICE-ROLE client, so it must ask that function with the
 * entry's own facts: the entry-results views gate on the caller and return no row
 * to a service-role read.
 */
function setup(
  held: unknown,
  options: {
    entries?: Array<Record<string, unknown>>;
    userRoles?: Array<Record<string, unknown>>;
  } = {}
) {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
  const { supabase, calls } = makeSupabase(
    baseTables({
      show_lifecycle_email_jobs: [numberNeededJob],
      entries: options.entries ?? [entryRow],
      ...(options.userRoles ? { user_roles: options.userRoles } : {}),
    }),
    held === undefined ? {} : { entry_awaiting_registration_number: held }
  );
  const handler = createSendLifecycleEmailHandler({
    fetch: fetch as unknown as typeof globalThis.fetch,
    resendApiKey: 'resend-key',
  });
  return { fetch, supabase, calls, handler };
}

const send = (
  handler: ReturnType<typeof setup>['handler'],
  supabase: unknown,
  userId = 'secretary-1'
) =>
  handler({
    body: { action: 'send', show_id: 'show-1', job_ids: ['job-number'] },
    user: { id: userId },
    supabase: supabase as Parameters<typeof handler>[0]['supabase'],
  });

describe('send-lifecycle-email registration_number_needed', () => {
  it("sends while the entry is still held, asking the server's own predicate with the entry's facts", async () => {
    const { fetch, supabase, calls, handler } = setup(true);

    const result = await send(handler, supabase);

    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0, skipped: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calls).toContainEqual({
      table: 'entry_awaiting_registration_number',
      action: 'rpc',
      value: {
        p_dog_id: 'dog-1',
        p_class_id: 'class-1',
        p_entry_status: 'confirmed',
        p_deleted_at: null,
      },
    });
    // Never through a caller-gated view: a service-role read gets no row there.
    expect(supabase.from).not.toHaveBeenCalledWith('view_authenticated_entry_results');
  });

  it('skips the job without calling Resend once the number has been added', async () => {
    const { fetch, supabase, calls, handler } = setup(false);

    const result = await send(handler, supabase);

    expect(result).toMatchObject({ attempted: 1, sent: 0, failed: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'show_lifecycle_email_jobs',
          action: 'update',
          value: expect.objectContaining({
            status: 'skipped',
            skipped_at: expect.any(String),
            updated_by: 'secretary-1',
          }),
        }),
      ])
    );
    expect(calls.some(call => call.table === 'email_log')).toBe(false);
  });

  it('skips the job when the entry is gone or belongs to another show', async () => {
    for (const entries of [[], [{ ...entryRow, show_id: 'show-2' }]]) {
      const { fetch, supabase, handler } = setup(true, { entries });

      const result = await send(handler, supabase);

      expect(result).toMatchObject({ sent: 0, skipped: 1 });
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it('skips, never sends on a guess, when the held check fails', async () => {
    const { fetch, supabase, handler } = setup({ error: { message: 'permission denied' } });

    const result = await send(handler, supabase);

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an unauthorized caller before the held check or Resend', async () => {
    const { fetch, supabase, handler } = setup(true, { userRoles: [] });

    await expect(send(handler, supabase, 'user-1')).rejects.toThrow(
      'Forbidden: show official role required'
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('does not run the held check for other step types', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
    const { supabase } = makeSupabase(baseTables());
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    await handler({
      body: { action: 'send', show_id: 'show-1', job_ids: ['job-1'] },
      user: { id: 'secretary-1' },
      supabase,
    });

    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

/**
 * The one-step action (MYK9-1162): the browser sends only the reviewed text; the server
 * authorizes, checks the step switch and the held verdict, resolves the CURRENT recipient,
 * replaces any earlier sendable email, inserts one job and sends it.
 */
const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_KEY = `show-lifecycle-email:show-1:registration_number_needed:entry:request-${REQUEST_ID}:entry-1`;

describe('send_registration_number_needed action', () => {
  const stepRow = { id: 'step-rn', show_id: 'show-1', step_type: 'registration_number_needed' };

  function arrange(
    options: {
      held?: unknown;
      jobs?: Array<Record<string, unknown>>;
      step?: Record<string, unknown> | null;
      people?: Array<Record<string, unknown>>;
      userRoles?: Array<Record<string, unknown>>;
      jobInsertError?: { code: string; message: string };
    } = {}
  ) {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
    const base = baseTables({
      show_lifecycle_email_jobs: options.jobs ?? [],
      show_lifecycle_email_steps: options.step === null ? [] : [options.step ?? stepRow],
      entries: [entryRow],
      ...(options.people ? { people: options.people } : {}),
      ...(options.userRoles ? { user_roles: options.userRoles } : {}),
    });
    const { supabase, calls } = makeSupabase(
      base,
      { entry_awaiting_registration_number: options.held === undefined ? true : options.held },
      options.jobInsertError
    );
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });
    const run = (userId = 'secretary-1') =>
      handler({
        body: {
          action: 'send_registration_number_needed',
          show_id: 'show-1',
          entry_id: 'entry-1',
          subject: 'Registration number needed for Willow',
          body: 'Please send the number.',
          secretary_note: 'Thanks',
          // A client-supplied key must be ignored; the request id names the email.
          idempotency_key: 'client-key',
          request_id: REQUEST_ID,
        },
        user: { id: userId },
        supabase: supabase as Parameters<typeof handler>[0]['supabase'],
      });
    return { fetch, supabase, calls, run };
  }

  const jobCalls = (calls: Array<{ table: string; action: string; value?: unknown }>) =>
    calls.filter(call => call.table === 'show_lifecycle_email_jobs');

  it('sends once to the owner, as a first email on the plain server-built key', async () => {
    const { fetch, calls, run } = arrange();

    const result = await run();

    expect(result).toEqual({ status: 'sent', jobId: 'inserted-job-1' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const insert = jobCalls(calls).find(call => call.action === 'insert');
    expect(insert?.value).toMatchObject({
      step_type: 'registration_number_needed',
      status: 'ready',
      recipient_scope: 'entry',
      entry_id: 'entry-1',
      recipient_email: 'jamie@example.com',
      idempotency_key: REQUEST_KEY,
    });
  });

  it('a retry of the same preview whose email already went out answers sent, with no second delivery', async () => {
    const { fetch, calls, run } = arrange({
      jobs: [
        {
          ...readyJob,
          id: 'mine',
          show_id: 'show-1',
          step_type: 'registration_number_needed',
          entry_id: 'entry-1',
          status: 'sent',
          idempotency_key: REQUEST_KEY,
        },
      ],
    });

    await expect(run()).resolves.toEqual({ status: 'sent', jobId: 'mine' });
    expect(fetch).not.toHaveBeenCalled();
    expect(jobCalls(calls).some(call => call.action === 'insert')).toBe(false);
  });

  it('a retry of the same preview whose send failed re-sends that email with its stored text', async () => {
    const { fetch, calls, run } = arrange({
      jobs: [
        {
          ...readyJob,
          id: 'mine',
          show_id: 'show-1',
          step_type: 'registration_number_needed',
          entry_id: 'entry-1',
          status: 'failed',
          subject: 'Stored subject',
          recipient_email: 'jamie@example.com',
          idempotency_key: REQUEST_KEY,
        },
      ],
    });

    await expect(run()).resolves.toEqual({ status: 'sent', jobId: 'mine' });
    expect(jobCalls(calls).some(call => call.action === 'insert')).toBe(false);
    const request = (
      fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }]
    )[1];
    expect(request.headers['Idempotency-Key']).toBe(REQUEST_KEY);
    expect(JSON.parse(request.body).subject).toBe('Stored subject');
  });

  it('refuses a request with no request id', async () => {
    const { supabase, handler } = (() => {
      const fetch = vi.fn();
      const { supabase } = makeSupabase(baseTables({ show_lifecycle_email_steps: [stepRow] }), {
        entry_awaiting_registration_number: true,
      });
      return {
        supabase,
        handler: createSendLifecycleEmailHandler({
          fetch: fetch as unknown as typeof globalThis.fetch,
          resendApiKey: 'resend-key',
        }),
      };
    })();

    await expect(
      handler({
        body: { action: 'send_registration_number_needed', show_id: 'show-1', entry_id: 'entry-1' },
        user: { id: 'secretary-1' },
        supabase,
      })
    ).rejects.toThrow('request_id is required');
  });

  it('marks the earlier failed job skipped BEFORE inserting the new one', async () => {
    const { calls, run } = arrange({
      jobs: [
        {
          id: 'old',
          show_id: 'show-1',
          step_type: 'registration_number_needed',
          entry_id: 'entry-1',
          status: 'failed',
        },
      ],
    });

    await run();

    const actions = jobCalls(calls)
      .filter(call => call.action !== 'rpc')
      .map(call => call.action);
    expect(actions.indexOf('update')).toBeGreaterThanOrEqual(0);
    expect(actions.indexOf('update')).toBeLessThan(actions.indexOf('insert'));
    expect(jobCalls(calls).find(call => call.action === 'update')?.value).toMatchObject({
      status: 'skipped',
      skipped_at: expect.any(String),
      updated_by: 'secretary-1',
    });
  });

  it('answers busy, cancelling nothing, while another send of this entry is in flight', async () => {
    // A READY job of this step is a send in progress: cancelling it would let both
    // near-simultaneous sends deliver.
    const { fetch, calls, run } = arrange({
      jobs: [
        {
          id: 'in-flight',
          show_id: 'show-1',
          step_type: 'registration_number_needed',
          entry_id: 'entry-1',
          status: 'ready',
          created_at: new Date().toISOString(),
        },
      ],
    });

    await expect(run()).resolves.toEqual({ status: 'busy' });
    expect(fetch).not.toHaveBeenCalled();
    expect(jobCalls(calls).some(call => call.action === 'update')).toBe(false);
    expect(jobCalls(calls).some(call => call.action === 'insert')).toBe(false);
  });

  it('replaces a ready job left behind by a send that died (older than the stale window)', async () => {
    const { calls, run } = arrange({
      jobs: [
        {
          id: 'stuck',
          show_id: 'show-1',
          step_type: 'registration_number_needed',
          entry_id: 'entry-1',
          status: 'ready',
          created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
        },
      ],
    });

    await expect(run()).resolves.toMatchObject({ status: 'sent' });
    const actions = jobCalls(calls).map(call => call.action);
    expect(actions.indexOf('update')).toBeLessThan(actions.indexOf('insert'));
  });

  it.each([
    ['a send that died after the provider accepted it (stale ready)', 'ready', 11],
    ['a failed delivery', 'failed', 0],
  ])(
    'recovers %s with its OWN key when the address is unchanged, so it cannot deliver twice',
    async (_label, status, ageMinutes) => {
      const { fetch, calls, run } = arrange({
        jobs: [
          {
            ...readyJob,
            id: 'earlier',
            show_id: 'show-1',
            step_type: 'registration_number_needed',
            entry_id: 'entry-1',
            status,
            recipient_email: 'jamie@example.com',
            idempotency_key: 'earlier-key',
            created_at: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
          },
        ],
      });

      await expect(run()).resolves.toEqual({ status: 'sent', jobId: 'earlier', recovered: true });
      expect(jobCalls(calls).some(call => call.action === 'insert')).toBe(false);
      const headers = (
        fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string> }]
      )[1].headers;
      expect(headers['Idempotency-Key']).toBe('earlier-key');
      // Replayed exactly: the provider refuses a changed payload under a seen key.
      const sentBody = JSON.parse(
        (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
      ) as { subject: string };
      expect(sentBody.subject).toBe(readyJob.subject);
    }
  );

  it('replaces the earlier email with a fresh one when the address has changed since', async () => {
    const { calls, run } = arrange({
      jobs: [
        {
          id: 'old-address',
          show_id: 'show-1',
          step_type: 'registration_number_needed',
          entry_id: 'entry-1',
          status: 'failed',
          recipient_email: 'old@example.com',
        },
      ],
    });

    await expect(run()).resolves.toMatchObject({ status: 'sent', jobId: 'inserted-job-1' });
    const actions = jobCalls(calls).map(call => call.action);
    expect(actions.indexOf('update')).toBeLessThan(actions.indexOf('insert'));
  });

  it('answers busy, with no Resend call, when another send holds the entry (23505)', async () => {
    const { fetch, run } = arrange({
      jobInsertError: { code: '23505', message: 'duplicate key value' },
    });

    await expect(run()).resolves.toEqual({ status: 'busy' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tells not_held (number on file) from unverified (could not check), creating no job', async () => {
    const notHeld = arrange({ held: false });
    await expect(notHeld.run()).resolves.toEqual({ status: 'skipped', reason: 'not_held' });
    expect(notHeld.fetch).not.toHaveBeenCalled();
    expect(jobCalls(notHeld.calls).some(call => call.action === 'insert')).toBe(false);

    const unverified = arrange({ held: { error: { message: 'boom' } } });
    await expect(unverified.run()).resolves.toEqual({ status: 'skipped', reason: 'unverified' });
    expect(unverified.fetch).not.toHaveBeenCalled();
    expect(jobCalls(unverified.calls).some(call => call.action === 'insert')).toBe(false);
  });

  it('skips with no_email, creating no job and leaving earlier jobs alone', async () => {
    const { fetch, calls, run } = arrange({
      people: [{ id: 'person-1', first_name: 'Jamie', last_name: 'Handler', email: '  ' }],
    });

    await expect(run()).resolves.toEqual({ status: 'skipped', reason: 'no_email' });
    expect(fetch).not.toHaveBeenCalled();
    expect(jobCalls(calls)).toEqual([]);
  });

  it("sends to the owner's CURRENT email, not a value from the request or an old job", async () => {
    const { fetch, calls, run } = arrange({
      people: [
        { id: 'person-1', first_name: 'Jamie', last_name: 'Handler', email: 'new@example.com' },
      ],
    });

    await run();

    const insert = jobCalls(calls).find(call => call.action === 'insert');
    expect(insert?.value).toMatchObject({ recipient_email: 'new@example.com' });
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    ) as { to: string };
    expect(body.to).toBe('new@example.com');
  });

  it('refuses an unauthorized caller before the step, the entry or Resend are touched', async () => {
    const { fetch, supabase, run } = arrange({ userRoles: [] });

    await expect(run('user-1')).rejects.toThrow('Forbidden: show official role required');
    expect(fetch).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalledWith('show_lifecycle_email_steps');
  });

  it('refuses when the club turned the step off, before any entry read or job write', async () => {
    const { fetch, supabase, calls, run } = arrange({ step: { ...stepRow, is_enabled: false } });

    await expect(run()).rejects.toThrow('turned off');
    expect(fetch).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(jobCalls(calls)).toEqual([]);
  });

  describe('a retry after a lost response (stateful)', () => {
    const earlierJob = {
      ...readyJob,
      id: 'earlier',
      show_id: 'show-1',
      step_type: 'registration_number_needed',
      entry_id: 'entry-1',
      status: 'failed',
      recipient_email: 'jamie@example.com',
      idempotency_key: 'earlier-key',
    };

    function arrangeStateful(job: Record<string, unknown>, ownerEmail: string) {
      const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
      const { supabase, tables, failNext } = makeStatefulSupabase(
        baseTables({
          show_lifecycle_email_jobs: [job],
          show_lifecycle_email_steps: [stepRow],
          entries: [entryRow],
          people: [
            { id: 'person-1', first_name: 'Jamie', last_name: 'Handler', email: ownerEmail },
          ],
        }),
        { entry_awaiting_registration_number: true }
      );
      const handler = createSendLifecycleEmailHandler({
        fetch: fetch as unknown as typeof globalThis.fetch,
        resendApiKey: 'resend-key',
      });
      const run = () =>
        handler({
          body: {
            action: 'send_registration_number_needed',
            show_id: 'show-1',
            entry_id: 'entry-1',
            subject: 'Registration number needed for Willow',
            request_id: REQUEST_ID,
          },
          user: { id: 'secretary-1' },
          supabase: supabase as unknown as Parameters<typeof handler>[0]['supabase'],
        });
      const recipients = () =>
        fetch.mock.calls.map(
          call =>
            (JSON.parse((call as unknown as [string, { body: string }])[1].body) as { to: string })
              .to
        );
      return { fetch, tables, run, recipients, failNext };
    }

    it("a retry of a request that RECOVERED an earlier job answers that job's outcome, with no second email", async () => {
      const { fetch, run } = arrangeStateful(earlierJob, 'jamie@example.com');

      await expect(run()).resolves.toEqual({ status: 'sent', jobId: 'earlier', recovered: true });
      // The response was lost; the browser retries the same preview.
      const retry = await run();

      expect(retry).toMatchObject({ status: 'sent', jobId: 'earlier' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("a retry of the preview's own job goes to the owner's CURRENT address, replacing the obsolete one", async () => {
      const { fetch, tables, run, recipients } = arrangeStateful(
        {
          ...earlierJob,
          id: 'mine',
          idempotency_key: REQUEST_KEY,
          recipient_email: 'old@example.com',
        },
        'new@example.com'
      );

      const result = await run();

      expect(result).toMatchObject({ status: 'sent' });
      expect(recipients()).toEqual(['new@example.com']);
      expect(tables.show_lifecycle_email_jobs.find(row => row.id === 'mine')?.status).toBe(
        'skipped'
      );
      // And a lost response to THAT retry is still one email, not two.
      await run();
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    const staleJob = {
      ...earlierJob,
      id: 'mine',
      idempotency_key: REQUEST_KEY,
      recipient_email: 'old@example.com',
    };
    const statusOf = (tables: Record<string, Array<Record<string, unknown>>>, id: string) =>
      tables.show_lifecycle_email_jobs.find(row => row.id === id)?.status;

    it('a replacement insert that fails partway does not strand the request: the retry sends to the new address', async () => {
      const { fetch, tables, run, recipients, failNext } = arrangeStateful(
        staleJob,
        'new@example.com'
      );
      failNext('show_lifecycle_email_jobs', 'insert');

      await expect(run()).rejects.toThrow();
      expect(fetch).not.toHaveBeenCalled();

      await expect(run()).resolves.toMatchObject({ status: 'sent' });
      expect(recipients()).toEqual(['new@example.com']);
      expect(statusOf(tables, 'mine')).toBe('skipped');
    });

    it('a failed replacement send is retried as the same one replacement, never a second job', async () => {
      const { fetch, tables, run, recipients } = arrangeStateful(staleJob, 'new@example.com');
      fetch.mockImplementationOnce(
        async () => ({ ok: false, status: 500, text: async () => '' }) as never
      );

      await expect(run()).resolves.toMatchObject({ status: 'failed' });
      await expect(run()).resolves.toMatchObject({ status: 'sent' });

      expect(recipients()).toEqual(['new@example.com', 'new@example.com']);
      expect(tables.show_lifecycle_email_jobs).toHaveLength(2);
      expect(statusOf(tables, 'mine')).toBe('skipped');
    });
  });
});
