// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';
import { makeStatefulSupabase } from './lifecycle-email-handler.statefulSupabase';
import { baseTables, readyJob } from './lifecycle-email-handler.testUtils';

const FIRST_REQUEST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SECOND_REQUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const stepRow = { id: 'step-rn', show_id: 'show-1', step_type: 'registration_number_needed' };
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
const STALE_MS = 10 * 60 * 1000;
const FINISH = 'finish_registration_number_needed_attempt';

type Row = Record<string, unknown>;

/**
 * MYK9-1212. A send is an ATTEMPT: the claim mints it with a lease, nothing touches a
 * job while its attempt is active (not even the same request's replay), and only the
 * attempt that owns the job records the outcome. Barriers on the provider call hold an
 * attempt mid-send while other requests run, against the actual handler.
 */
describe('registration number needed: one owned attempt per job', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const earlierJob = {
    ...readyJob,
    id: 'earlier',
    show_id: 'show-1',
    step_type: 'registration_number_needed',
    entry_id: 'entry-1',
    recipient_email: 'old@example.com',
    idempotency_key: 'earlier-key',
  };

  /** `gated` provider calls block (in order) until their gate is released. */
  function arrange(jobs: Row[], gated = 1) {
    const okResponse = { ok: true, json: async () => ({ id: 'resend-1' }) };
    const gates = Array.from({ length: gated }, () => {
      let release: () => void = () => {};
      let started: () => void = () => {};
      const reached = new Promise<void>(resolve => (started = resolve));
      const open = new Promise<void>(resolve => (release = resolve));
      return { release, reached, started, open };
    });
    let call = 0;
    const fetch = vi.fn(async () => {
      const gate = gates[call];
      call += 1;
      if (gate) {
        gate.started();
        await gate.open;
      }
      return okResponse;
    });
    const { supabase, tables, failNext } = makeStatefulSupabase(
      baseTables({
        show_lifecycle_email_jobs: jobs,
        show_lifecycle_email_job_requests: [],
        show_lifecycle_email_steps: [stepRow],
        entries: [entryRow],
        people: [
          { id: 'person-1', first_name: 'Jamie', last_name: 'Handler', email: 'old@example.com' },
        ],
      }),
      { entry_awaiting_registration_number: true }
    );
    const handler = createSendLifecycleEmailHandler({
      fetch: fetch as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    });
    const asSupabase = supabase as unknown as Parameters<typeof handler>[0]['supabase'];
    const run = (requestId: string) =>
      handler({
        body: {
          action: 'send_registration_number_needed',
          show_id: 'show-1',
          entry_id: 'entry-1',
          subject: 'Registration number needed for Willow',
          request_id: requestId,
        },
        user: { id: 'secretary-1' },
        supabase: asSupabase,
      });
    const genericSend = (jobId: string) =>
      handler({
        body: { action: 'send', show_id: 'show-1', job_ids: [jobId] },
        user: { id: 'secretary-1' },
        supabase: asSupabase,
      });
    const recipients = () =>
      fetch.mock.calls.map(
        c => (JSON.parse((c as unknown as [string, { body: string }])[1].body) as { to: string }).to
      );
    const correctAddress = () => {
      tables.people[0].email = 'corrected@example.com';
    };
    const job = (id: string) => tables.show_lifecycle_email_jobs.find(row => row.id === id);
    const onlyJob = () => tables.show_lifecycle_email_jobs[0];
    const expireLeases = () => vi.setSystemTime(Date.now() + STALE_MS + 1000);
    return {
      fetch,
      gates,
      tables,
      failNext,
      run,
      genericSend,
      recipients,
      correctAddress,
      job,
      onlyJob,
      expireLeases,
    };
  }

  // Seeds are built inside each test, so lease ages are measured on the faked clock.
  const variants: Array<[string, () => Row[], string | null]> = [
    ['a first email', () => [], null],
    ['recovering a FAILED job', () => [{ ...earlierJob, status: 'failed' }], 'earlier'],
    [
      'recovering an ABANDONED ready job (lease expired)',
      () => [
        {
          ...earlierJob,
          status: 'ready',
          attempt_id: 'attempt-dead',
          claimed_until: new Date(Date.now() - 1000).toISOString(),
        },
      ],
      'earlier',
    ],
  ];

  for (const [label, seed, seededId] of variants) {
    it(`${label}: while it sends, a replay and a correction both answer busy; then exactly one email`, async () => {
      const a = arrange(seed());
      const id = () => seededId ?? String(a.onlyJob().id);

      const first = a.run(FIRST_REQUEST);
      await a.gates[0].reached;
      // The attempt is leased for the handler's stale window from the claim moment.
      expect(a.job(id())?.claimed_until).toBe(new Date(Date.now() + STALE_MS).toISOString());
      expect(a.job(id())?.attempt_id).toEqual(expect.any(String));
      const owner = a.job(id())?.attempt_id;

      // The same request's lost-response retry: busy, and no second provider call.
      await expect(a.run(FIRST_REQUEST)).resolves.toEqual({ status: 'busy' });
      expect(a.fetch).toHaveBeenCalledTimes(1);

      a.correctAddress();
      await expect(a.run(SECOND_REQUEST)).resolves.toEqual({ status: 'busy' });
      await expect(a.run(FIRST_REQUEST)).resolves.toEqual({ status: 'busy' });
      expect(a.recipients()).toEqual(['old@example.com']);
      expect(a.tables.show_lifecycle_email_jobs).toHaveLength(1);
      expect(a.job(id())?.status).toMatch(/^(ready|failed)$/);
      expect(a.job(id())?.attempt_id).toBe(owner);

      a.gates[0].release();
      await expect(first).resolves.toMatchObject({ status: 'sent', jobId: id() });
      expect(a.recipients()).toEqual(['old@example.com']);
      // The owner recorded the outcome and released the job.
      expect(a.job(id())).toMatchObject({ status: 'sent', attempt_id: null, claimed_until: null });
    });
  }

  it('a generic send during an active attempt is skipped, leaving the attempt and lease intact', async () => {
    const a = arrange([]);
    const first = a.run(FIRST_REQUEST);
    await a.gates[0].reached;
    const before = { ...a.onlyJob() };

    await expect(a.genericSend(String(before.id))).resolves.toMatchObject({
      attempted: 1,
      sent: 0,
      skipped: 1,
      results: [{ jobId: before.id, status: 'skipped', reason: 'send_on_demand' }],
    });

    expect(a.fetch).toHaveBeenCalledTimes(1);
    expect(a.onlyJob()).toEqual(before);
    a.gates[0].release();
    await expect(first).resolves.toMatchObject({ status: 'sent' });
  });

  for (const [who, requestId] of [
    ['another request', SECOND_REQUEST],
    ["the attempt's own request (current recipient via the expired lease)", FIRST_REQUEST],
  ] as const) {
    it(`an abandoned attempt finishing late changes nothing once ${who} has replaced it`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const a = arrange([]);
      const first = a.run(FIRST_REQUEST);
      await a.gates[0].reached;
      const abandoned = { id: String(a.onlyJob().id), attempt: a.onlyJob().attempt_id };

      // The isolate is presumed dead: its lease runs out and the address is corrected.
      a.expireLeases();
      a.correctAddress();
      await expect(a.run(requestId)).resolves.toMatchObject({ status: 'sent' });
      expect(a.job(abandoned.id)?.status).toBe('skipped');
      const replacement = a.tables.show_lifecycle_email_jobs.find(row => row.id !== abandoned.id);
      expect(replacement).toMatchObject({
        status: 'sent',
        recipient_email: 'corrected@example.com',
      });

      a.gates[0].release();
      // The provider's real result is reported; the job row is not touched.
      await expect(first).resolves.toMatchObject({ status: 'sent', jobId: abandoned.id });
      expect(a.job(abandoned.id)).toMatchObject({ status: 'skipped', attempt_id: null });
      expect(replacement).toMatchObject({ status: 'sent' });
      expect(warn).toHaveBeenCalledWith(
        'send-lifecycle-email: attempt outcome not recorded',
        expect.objectContaining({
          lost_ownership: true,
          job_id: abandoned.id,
          attempt_id: abandoned.attempt,
        })
      );
      expect(a.recipients()).toEqual(['old@example.com', 'corrected@example.com']);
    });
  }

  it('a lost job-row write after delivery: the next claim after expiry records sent with no provider call', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = arrange([], 0);
    a.failNext(FINISH, 'rpc');

    // Delivered and logged, but the finish write was lost: the provider's result stands.
    await expect(a.run(FIRST_REQUEST)).resolves.toMatchObject({ status: 'sent' });
    const id = String(a.onlyJob().id);
    expect(a.onlyJob()).toMatchObject({ status: 'ready', attempt_id: expect.any(String) });
    const log = a.tables.email_log.find(row => row.related_id === id);
    expect(log).toMatchObject({ status: 'sent' });

    // Still leased: a retry is busy.
    await expect(a.run(FIRST_REQUEST)).resolves.toEqual({ status: 'busy' });
    a.expireLeases();
    await expect(a.run(FIRST_REQUEST)).resolves.toMatchObject({ status: 'sent', jobId: id });

    expect(a.fetch).toHaveBeenCalledTimes(1);
    expect(a.onlyJob()).toMatchObject({
      status: 'sent',
      email_log_id: log?.id,
      attempt_id: null,
      claimed_until: null,
    });
  });

  it("a losing finish never clears the current owner's attempt or lease", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = arrange([], 2);
    const first = a.run(FIRST_REQUEST);
    await a.gates[0].reached;
    const stale = a.onlyJob().attempt_id;

    // A's lease expires; the same request takes the job again with a NEW attempt.
    a.expireLeases();
    const second = a.run(FIRST_REQUEST);
    await a.gates[1].reached;
    const owner = { attempt: a.onlyJob().attempt_id, lease: a.onlyJob().claimed_until };
    expect(owner.attempt).not.toBe(stale);
    expect(owner.lease).toBe(new Date(Date.now() + STALE_MS).toISOString());

    a.gates[0].release();
    await first;
    expect(a.onlyJob()).toMatchObject({
      status: 'ready',
      attempt_id: owner.attempt,
      claimed_until: owner.lease,
    });
    expect(warn).toHaveBeenCalledWith(
      'send-lifecycle-email: attempt outcome not recorded',
      expect.objectContaining({ lost_ownership: true, attempt_id: stale })
    );

    a.gates[1].release();
    await expect(second).resolves.toMatchObject({ status: 'sent' });
    expect(a.onlyJob()).toMatchObject({ status: 'sent', attempt_id: null, claimed_until: null });
    expect(a.tables.show_lifecycle_email_jobs).toHaveLength(1);
  });
});
