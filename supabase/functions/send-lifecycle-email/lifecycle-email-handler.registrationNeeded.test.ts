// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';
import { makeStatefulSupabase } from './lifecycle-email-handler.statefulSupabase';
import { baseTables, makeSupabase, readyJob } from './lifecycle-email-handler.testUtils';
import {
  EDGE_FUNCTION_WALL_CLOCK_LIMIT_MS,
  NUMBER_NEEDED_STALE_SEND_MS,
} from './lifecycle-email-numberNeeded';

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
 * MYK9-1212. The generic `send` action never sends this step: its claim is the only
 * send path, because only the claim mints the attempt that may record the outcome.
 * A generic send of such a job reports it skipped (send_on_demand) and writes nothing.
 */
function setup(options: { userRoles?: Array<Record<string, unknown>> } = {}) {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
  const { supabase, calls } = makeSupabase(
    baseTables({
      show_lifecycle_email_jobs: [numberNeededJob],
      entries: [entryRow],
      ...(options.userRoles ? { user_roles: options.userRoles } : {}),
    }),
    { entry_awaiting_registration_number: true }
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

describe('generic send of a registration_number_needed job', () => {
  it('skips it as send_on_demand: no provider call, no rpc, no write', async () => {
    const { fetch, supabase, calls, handler } = setup();

    const result = await send(handler, supabase);

    expect(result).toEqual({
      attempted: 1,
      sent: 0,
      failed: 0,
      skipped: 1,
      results: [{ jobId: 'job-number', status: 'skipped', reason: 'send_on_demand' }],
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(calls.filter(call => call.action === 'update' || call.action === 'insert')).toEqual([]);
  });

  it('refuses an unauthorized caller before anything else', async () => {
    const { fetch, supabase, handler } = setup({ userRoles: [] });

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
  const CLAIM = 'claim_registration_number_needed_job';

  function arrange(
    options: {
      held?: unknown;
      jobs?: Array<Record<string, unknown>>;
      step?: Record<string, unknown> | null;
      people?: Array<Record<string, unknown>>;
      userRoles?: Array<Record<string, unknown>>;
      claim?: unknown;
      entries?: Array<Record<string, unknown>>;
    } = {}
  ) {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
    const { supabase, tables, failNext } = makeStatefulSupabase(
      baseTables({
        show_lifecycle_email_jobs: options.jobs ?? [],
        show_lifecycle_email_steps: options.step === null ? [] : [options.step ?? stepRow],
        entries: options.entries ?? [entryRow],
        ...(options.people ? { people: options.people } : {}),
        ...(options.userRoles ? { user_roles: options.userRoles } : {}),
      }),
      {
        entry_awaiting_registration_number: options.held === undefined ? true : options.held,
        ...(options.claim === undefined ? {} : { [CLAIM]: options.claim }),
      }
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
        supabase: supabase as unknown as Parameters<typeof handler>[0]['supabase'],
      });
    const claimArgs = () =>
      (supabase.rpc.mock.calls as unknown as Array<[string, Record<string, unknown>]>)
        .filter(([fn]) => fn === CLAIM)
        .map(([, args]) => args);
    const sentHeaders = () =>
      (fetch.mock.calls[0] as unknown as [string, { headers: Record<string, string> }])[1].headers;
    return { fetch, supabase, tables, failNext, run, claimArgs, sentHeaders };
  }

  const jobs = (tables: Record<string, Array<Record<string, unknown>>>) =>
    tables.show_lifecycle_email_jobs;
  const earlier = (extra: Record<string, unknown>) => ({
    ...readyJob,
    id: 'earlier',
    show_id: 'show-1',
    step_type: 'registration_number_needed',
    entry_id: 'entry-1',
    recipient_email: 'jamie@example.com',
    idempotency_key: 'earlier-key',
    ...extra,
  });

  it('sends once to the owner, as a first email on the plain server-built key', async () => {
    const { fetch, tables, run, claimArgs } = arrange();

    const result = await run();

    expect(result).toEqual({ status: 'sent', jobId: jobs(tables)[0].id });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jobs(tables)).toHaveLength(1);
    expect(jobs(tables)[0]).toMatchObject({
      step_type: 'registration_number_needed',
      recipient_scope: 'entry',
      entry_id: 'entry-1',
      recipient_email: 'jamie@example.com',
      idempotency_key: REQUEST_KEY,
    });
    expect(tables.show_lifecycle_email_job_requests).toEqual([
      { show_id: 'show-1', request_key: REQUEST_KEY, job_id: jobs(tables)[0].id },
    ]);
    // The claim gets the server-built key and the reviewed text, never the client's key.
    expect(claimArgs()).toEqual([
      expect.objectContaining({
        p_show_id: 'show-1',
        p_entry_id: 'entry-1',
        p_step_id: 'step-rn',
        p_request_key: REQUEST_KEY,
        p_recipient_email: 'jamie@example.com',
        p_subject: 'Registration number needed for Willow',
        p_body: 'Please send the number.',
        p_secretary_note: 'Thanks',
        p_user_id: 'secretary-1',
      }),
    ]);
  });

  it('hands the claim an attempt lease ten minutes ahead, and no stale cutoff', async () => {
    const { run, claimArgs } = arrange();
    const before = Date.now();

    await run();

    const lease = Date.parse(String(claimArgs()[0].p_lease_until));
    expect(lease).toBeGreaterThanOrEqual(before + NUMBER_NEEDED_STALE_SEND_MS);
    expect(lease).toBeLessThanOrEqual(Date.now() + NUMBER_NEEDED_STALE_SEND_MS);
    expect(claimArgs()[0]).not.toHaveProperty('p_stale_before');
  });

  it('the lease outlives any edge invocation, so an expired lease is a dead attempt', () => {
    expect(EDGE_FUNCTION_WALL_CLOCK_LIMIT_MS).toBe(400 * 1000);
    expect(NUMBER_NEEDED_STALE_SEND_MS).toBeGreaterThan(EDGE_FUNCTION_WALL_CLOCK_LIMIT_MS);
  });

  it("asks the server's own held predicate with the entry's facts", async () => {
    const { supabase, run } = arrange();

    await run();

    expect(supabase.rpc).toHaveBeenCalledWith('entry_awaiting_registration_number', {
      p_dog_id: 'dog-1',
      p_class_id: 'class-1',
      p_entry_status: 'confirmed',
      p_deleted_at: null,
    });
    // Never through a caller-gated view: a service-role read gets no row there.
    expect(supabase.from).not.toHaveBeenCalledWith('view_authenticated_entry_results');
  });

  it('skips as not_held, claiming nothing, when the entry is gone or in another show', async () => {
    for (const entries of [[], [{ ...entryRow, show_id: 'show-2' }]]) {
      const { fetch, run, claimArgs } = arrange({ entries });

      await expect(run()).resolves.toEqual({ status: 'skipped', reason: 'not_held' });
      expect(fetch).not.toHaveBeenCalled();
      expect(claimArgs()).toEqual([]);
    }
  });

  it('a retry of the same preview whose email already went out answers sent, with no second delivery', async () => {
    const { fetch, tables, run } = arrange({
      jobs: [
        earlier({
          id: 'mine',
          status: 'sent',
          idempotency_key: REQUEST_KEY,
          request_key: REQUEST_KEY,
        }),
      ],
    });

    await expect(run()).resolves.toEqual({ status: 'sent', jobId: 'mine' });
    expect(fetch).not.toHaveBeenCalled();
    expect(jobs(tables)).toHaveLength(1);
  });

  it('a retry of the same preview whose send failed re-sends that email with its stored text', async () => {
    const { fetch, tables, run, sentHeaders } = arrange({
      jobs: [
        earlier({
          id: 'mine',
          status: 'failed',
          subject: 'Stored subject',
          idempotency_key: REQUEST_KEY,
          request_key: REQUEST_KEY,
        }),
      ],
    });

    await expect(run()).resolves.toEqual({ status: 'sent', jobId: 'mine' });
    expect(jobs(tables)).toHaveLength(1);
    expect(sentHeaders()['Idempotency-Key']).toBe(REQUEST_KEY);
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
    ) as { subject: string };
    expect(body.subject).toBe('Stored subject');
  });

  it('refuses a request with no request id', async () => {
    const { supabase } = makeStatefulSupabase(
      baseTables({ show_lifecycle_email_steps: [stepRow] }),
      { entry_awaiting_registration_number: true }
    );
    const handler = createSendLifecycleEmailHandler({
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });

    await expect(
      handler({
        body: { action: 'send_registration_number_needed', show_id: 'show-1', entry_id: 'entry-1' },
        user: { id: 'secretary-1' },
        supabase: supabase as unknown as Parameters<typeof handler>[0]['supabase'],
      })
    ).rejects.toThrow('request_id is required');
  });

  it('answers busy, cancelling nothing, while another send of this entry is in flight', async () => {
    // An ACTIVE attempt (attempt_id + live lease) is a send in progress: cancelling it
    // would let both near-simultaneous sends deliver.
    const inFlight = earlier({
      id: 'in-flight',
      status: 'ready',
      attempt_id: 'attempt-live',
      claimed_until: new Date(Date.now() + 60_000).toISOString(),
    });
    const { fetch, tables, run } = arrange({ jobs: [inFlight] });

    await expect(run()).resolves.toEqual({ status: 'busy' });
    expect(fetch).not.toHaveBeenCalled();
    expect(jobs(tables)).toEqual([inFlight]);
  });

  it.each([
    ['at the same address', 'jamie@example.com'],
    ['at a changed address', 'old@example.com'],
  ])(
    'answers busy for a pre-migration send (live lease, no attempt_id) %s, writing nothing',
    async (_label, storedEmail) => {
      const legacyInFlight = earlier({
        id: 'legacy-in-flight',
        status: 'ready',
        recipient_email: storedEmail,
        attempt_id: null,
        claimed_until: new Date(Date.now() + 60_000).toISOString(),
      });
      const { fetch, tables, run } = arrange({ jobs: [legacyInFlight] });

      await expect(run()).resolves.toEqual({ status: 'busy' });
      expect(fetch).not.toHaveBeenCalled();
      expect(jobs(tables)).toEqual([legacyInFlight]);
    }
  );

  it('replaces a stale ready job at a DIFFERENT address, skipping the old one first', async () => {
    const stuck = earlier({
      id: 'stuck',
      status: 'ready',
      recipient_email: 'old@example.com',
      created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    });
    const { tables, run } = arrange({ jobs: [stuck] });

    await expect(run()).resolves.toMatchObject({ status: 'sent' });
    expect(jobs(tables).find(row => row.id === 'stuck')).toMatchObject({
      status: 'skipped',
      skipped_at: expect.any(String),
      updated_by: 'secretary-1',
    });
    expect(jobs(tables)).toHaveLength(2);
  });

  it.each([
    ['a send that died after the provider accepted it (stale ready)', 'ready', 11],
    ['a failed delivery', 'failed', 0],
  ])(
    'recovers %s with its OWN key when the address is unchanged, so it cannot deliver twice',
    async (_label, status, ageMinutes) => {
      const { fetch, tables, run, sentHeaders } = arrange({
        jobs: [
          earlier({
            status,
            created_at: new Date(Date.now() - ageMinutes * 60 * 1000).toISOString(),
          }),
        ],
      });

      await expect(run()).resolves.toEqual({ status: 'sent', jobId: 'earlier', recovered: true });
      expect(jobs(tables)).toHaveLength(1);
      expect(sentHeaders()['Idempotency-Key']).toBe('earlier-key');
      // Replayed exactly: the provider refuses a changed payload under a seen key.
      const sentBody = JSON.parse(
        (fetch.mock.calls[0] as unknown as [string, { body: string }])[1].body
      ) as { subject: string };
      expect(sentBody.subject).toBe(readyJob.subject);
    }
  );

  it('replaces the earlier email with a fresh one when the address has changed since', async () => {
    const { tables, run } = arrange({
      jobs: [earlier({ id: 'old-address', status: 'failed', recipient_email: 'old@example.com' })],
    });

    const result = await run();

    expect(result).toMatchObject({ status: 'sent' });
    expect(jobs(tables).find(row => row.id === 'old-address')?.status).toBe('skipped');
    expect(jobs(tables).filter(row => row.status === 'sent')).toHaveLength(1);
  });

  it('answers busy, with no Resend call, when another writer holds the entry (23505)', async () => {
    const { fetch, run } = arrange({
      claim: { error: { code: '23505', message: 'duplicate key value' } },
    });

    await expect(run()).resolves.toEqual({ status: 'busy' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails loudly, sending nothing, when the claim errors or answers something unexpected', async () => {
    const errored = arrange({ claim: { error: { message: 'boom' } } });
    await expect(errored.run()).rejects.toThrow('boom');
    expect(errored.fetch).not.toHaveBeenCalled();

    const garbled = arrange({ claim: { outcome: 'maybe' } });
    await expect(garbled.run()).rejects.toThrow('Failed to save lifecycle email');
    expect(garbled.fetch).not.toHaveBeenCalled();

    // A `send` that owns no attempt could never record its outcome: refuse to send it.
    const unowned = arrange({ claim: { outcome: 'send', job_id: 'job-x', recovered: false } });
    await expect(unowned.run()).rejects.toThrow('Failed to save lifecycle email');
    expect(unowned.fetch).not.toHaveBeenCalled();
  });

  it('tells not_held (number on file) from unverified (could not check), claiming nothing', async () => {
    const notHeld = arrange({ held: false });
    await expect(notHeld.run()).resolves.toEqual({ status: 'skipped', reason: 'not_held' });
    expect(notHeld.fetch).not.toHaveBeenCalled();
    expect(notHeld.claimArgs()).toEqual([]);

    const unverified = arrange({ held: { error: { message: 'boom' } } });
    await expect(unverified.run()).resolves.toEqual({ status: 'skipped', reason: 'unverified' });
    expect(unverified.fetch).not.toHaveBeenCalled();
    expect(unverified.claimArgs()).toEqual([]);
  });

  it('skips with no_email, claiming nothing and leaving earlier jobs alone', async () => {
    const stuck = earlier({ status: 'failed' });
    const { fetch, tables, run, claimArgs } = arrange({
      jobs: [stuck],
      people: [{ id: 'person-1', first_name: 'Jamie', last_name: 'Handler', email: '  ' }],
    });

    await expect(run()).resolves.toEqual({ status: 'skipped', reason: 'no_email' });
    expect(fetch).not.toHaveBeenCalled();
    expect(claimArgs()).toEqual([]);
    expect(jobs(tables)).toEqual([stuck]);
  });

  it("sends to the owner's CURRENT email, not a value from the request or an old job", async () => {
    const { fetch, tables, run } = arrange({
      people: [
        { id: 'person-1', first_name: 'Jamie', last_name: 'Handler', email: 'new@example.com' },
      ],
    });

    await run();

    expect(jobs(tables)[0]).toMatchObject({ recipient_email: 'new@example.com' });
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
    const { fetch, supabase, tables, run } = arrange({ step: { ...stepRow, is_enabled: false } });

    await expect(run()).rejects.toThrow('turned off');
    expect(fetch).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(jobs(tables)).toEqual([]);
  });
});
