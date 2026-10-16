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

/**
 * MYK9-1212 residual. A job a request RECOVERS (failed, or ready and stale) is sent
 * again under its own provider key. While that send is in flight an owner-address
 * correction must not supersede it and send a replacement under a second key: both
 * emails would land. The claim stamps an in-flight lease; only an abandoned attempt
 * (lease expired) may be replaced. A barrier on the provider call holds the first
 * request mid-send while the second one runs, against the actual handler.
 */
describe('a recovered send in flight cannot be superseded by an address correction', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-16T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
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

  function arrange(job: Record<string, unknown>) {
    let release: () => void = () => {};
    let started: () => void = () => {};
    const providerStarted = new Promise<void>(resolve => (started = resolve));
    const gate = new Promise<void>(resolve => (release = resolve));
    const okResponse = { ok: true, json: async () => ({ id: 'resend-1' }) };
    const fetch = vi.fn(async () => okResponse);
    // Only the FIRST provider call blocks: it is the recovered send held in flight.
    fetch.mockImplementationOnce(async () => {
      started();
      await gate;
      return okResponse;
    });
    const { supabase, tables } = makeStatefulSupabase(
      baseTables({
        show_lifecycle_email_jobs: [job],
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
        supabase: supabase as unknown as Parameters<typeof handler>[0]['supabase'],
      });
    const recipients = () =>
      fetch.mock.calls.map(
        call =>
          (JSON.parse((call as unknown as [string, { body: string }])[1].body) as { to: string }).to
      );
    const correctAddress = () => {
      tables.people[0].email = 'corrected@example.com';
    };
    const job1 = () => tables.show_lifecycle_email_jobs.find(row => row.id === 'earlier');
    return { release, providerStarted, tables, run, recipients, correctAddress, job1 };
  }

  // Seeds are built inside each test, so a stale age is measured on the faked clock.
  const variants = [
    ['a FAILED job', () => ({ status: 'failed' })],
    [
      'a STALE ready job',
      () => ({ status: 'ready', created_at: new Date(Date.now() - 2 * STALE_MS).toISOString() }),
    ],
  ] as const;

  for (const [label, seed] of variants) {
    it(`recovering ${label}: a correction while it sends answers busy, then one email in total`, async () => {
      const { release, providerStarted, run, recipients, correctAddress, tables, job1 } = arrange({
        ...earlierJob,
        ...seed(),
      });

      const first = run(FIRST_REQUEST);
      await providerStarted;
      // The lease is the handler's stale window from the claim moment.
      expect(job1()?.claimed_until).toBe(new Date(Date.now() + STALE_MS).toISOString());
      correctAddress();

      await expect(run(SECOND_REQUEST)).resolves.toEqual({ status: 'busy' });
      // The recovering request's own retry, now at a changed address, is busy as well.
      await expect(run(FIRST_REQUEST)).resolves.toEqual({ status: 'busy' });
      expect(recipients()).toEqual(['old@example.com']);
      expect(job1()?.status).not.toBe('skipped');
      expect(tables.show_lifecycle_email_jobs).toHaveLength(1);

      release();
      await expect(first).resolves.toMatchObject({ status: 'sent', jobId: 'earlier' });
      expect(recipients()).toEqual(['old@example.com']);
      expect(job1()?.status).toBe('sent');
      // The lease is cleared with the outcome.
      expect(job1()?.claimed_until).toBeNull();
    });

    it(`recovering ${label}: an ABANDONED attempt is replaced for the corrected address once its lease expires`, async () => {
      const { release, providerStarted, run, recipients, correctAddress, tables, job1 } = arrange({
        ...earlierJob,
        ...seed(),
      });

      const first = run(FIRST_REQUEST);
      await providerStarted;
      correctAddress();
      await expect(run(SECOND_REQUEST)).resolves.toEqual({ status: 'busy' });

      // R1 never finishes (a crashed isolate); its lease runs out.
      vi.setSystemTime(Date.now() + STALE_MS + 1000);
      await expect(run(SECOND_REQUEST)).resolves.toMatchObject({ status: 'sent' });

      expect(recipients()).toEqual(['old@example.com', 'corrected@example.com']);
      expect(job1()?.status).toBe('skipped');
      expect(tables.show_lifecycle_email_jobs).toHaveLength(2);
      release();
      await first;
    });
  }

  it('the same request replaying its job at the same address is allowed while the lease is active', async () => {
    const { release, providerStarted, run, recipients } = arrange({
      ...earlierJob,
      status: 'failed',
    });

    const first = run(FIRST_REQUEST);
    await providerStarted;
    // Same key, same address, same stored text: the provider collapses the replay.
    await expect(run(FIRST_REQUEST)).resolves.toMatchObject({ status: 'sent', jobId: 'earlier' });
    release();
    await first;
    expect(recipients()).toEqual(['old@example.com', 'old@example.com']);
  });
});
