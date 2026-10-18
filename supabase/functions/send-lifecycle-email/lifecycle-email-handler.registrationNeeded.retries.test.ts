// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';
import { makeStatefulSupabase } from './lifecycle-email-handler.statefulSupabase';
import { baseTables, readyJob } from './lifecycle-email-handler.testUtils';

const REQUEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REQUEST_KEY = `show-lifecycle-email:show-1:registration_number_needed:entry:request-${REQUEST_ID}:entry-1`;
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

/**
 * MYK9-1212. The request is the unit of exactly-once delivery: a retry after a lost
 * response must land on the SAME email, however the first attempt got its job.
 */
describe('a retry after a lost response (stateful, one atomic claim)', () => {
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

  function arrangeStateful(
    job: Record<string, unknown> | null,
    ownerEmail: string,
    ties: Array<Record<string, unknown>> = []
  ) {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'resend-1' }) }));
    const { supabase, tables, failNext } = makeStatefulSupabase(
      baseTables({
        show_lifecycle_email_jobs: job ? [job] : [],
        show_lifecycle_email_job_requests: ties,
        show_lifecycle_email_steps: [stepRow],
        entries: [entryRow],
        people: [{ id: 'person-1', first_name: 'Jamie', last_name: 'Handler', email: ownerEmail }],
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
          (JSON.parse((call as unknown as [string, { body: string }])[1].body) as { to: string }).to
      );
    return { fetch, tables, run, recipients, failNext };
  }
  const statusOf = (tables: Record<string, Array<Record<string, unknown>>>, id: string) =>
    tables.show_lifecycle_email_jobs.find(row => row.id === id)?.status;

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
        request_key: REQUEST_KEY,
        recipient_email: 'old@example.com',
      },
      'new@example.com'
    );

    const result = await run();

    expect(result).toMatchObject({ status: 'sent' });
    expect(recipients()).toEqual(['new@example.com']);
    expect(statusOf(tables, 'mine')).toBe('skipped');
    // And a lost response to THAT retry is still one email, not two.
    await run();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('a failed replacement send is retried as the same one replacement, never a third job', async () => {
    const { fetch, tables, run, recipients } = arrangeStateful(
      {
        ...earlierJob,
        id: 'mine',
        idempotency_key: REQUEST_KEY,
        request_key: REQUEST_KEY,
        recipient_email: 'old@example.com',
      },
      'new@example.com'
    );
    fetch.mockImplementationOnce(
      async () => ({ ok: false, status: 500, text: async () => '' }) as never
    );

    await expect(run()).resolves.toMatchObject({ status: 'failed' });
    await expect(run()).resolves.toMatchObject({ status: 'sent' });

    expect(recipients()).toEqual(['new@example.com', 'new@example.com']);
    expect(tables.show_lifecycle_email_jobs).toHaveLength(2);
    expect(statusOf(tables, 'mine')).toBe('skipped');
  });

  it('a claim that fails partway leaves nothing behind: the retry sends once, to the new address', async () => {
    const { fetch, tables, run, recipients, failNext } = arrangeStateful(
      {
        ...earlierJob,
        id: 'mine',
        idempotency_key: REQUEST_KEY,
        request_key: REQUEST_KEY,
        recipient_email: 'old@example.com',
      },
      'new@example.com'
    );
    failNext('show_lifecycle_email_jobs', 'rpc');

    await expect(run()).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(statusOf(tables, 'mine')).toBe('failed');

    await expect(run()).resolves.toMatchObject({ status: 'sent' });
    expect(recipients()).toEqual(['new@example.com']);
    expect(statusOf(tables, 'mine')).toBe('skipped');
  });

  it('after a replacement the request key points at exactly one job', async () => {
    const { tables, run } = arrangeStateful(
      {
        ...earlierJob,
        id: 'mine',
        idempotency_key: REQUEST_KEY,
        request_key: REQUEST_KEY,
        recipient_email: 'old@example.com',
      },
      'new@example.com'
    );

    await run();
    await run();

    const tied = tables.show_lifecycle_email_job_requests.filter(
      row => row.request_key === REQUEST_KEY
    );
    expect(tied).toHaveLength(1);
    expect(tied[0].job_id).not.toBe('mine');
  });

  describe('many requests resolving to one job (A creates, B recovers, C recovers and sends)', () => {
    const TIES = 'show_lifecycle_email_job_requests';
    // The job was created by request A; B's retry (this test's REQUEST_KEY) and C both
    // recovered it since. Every one of them must keep resolving to that one job.
    const sharedJob = (status: string) => ({
      ...earlierJob,
      id: 'shared',
      status,
      idempotency_key: 'show-lifecycle-email:key-of-a',
    });
    const ties = [
      { show_id: 'show-1', request_key: 'show-lifecycle-email:key-of-a', job_id: 'shared' },
      { show_id: 'show-1', request_key: REQUEST_KEY, job_id: 'shared' },
      { show_id: 'show-1', request_key: 'show-lifecycle-email:key-of-c', job_id: 'shared' },
    ];

    it("B's lost-response retry answers sent for the shared job, with no second email", async () => {
      const arranged = arrangeStateful(sharedJob('sent'), 'jamie@example.com', ties);

      await expect(arranged.run()).resolves.toEqual({ status: 'sent', jobId: 'shared' });

      expect(arranged.fetch).not.toHaveBeenCalled();
      expect(arranged.tables.show_lifecycle_email_jobs).toHaveLength(1);
      expect(arranged.tables[TIES]).toHaveLength(3);
    });

    it('a retry replays the shared job while it is ready, never busy', async () => {
      const arranged = arrangeStateful(
        { ...sharedJob('ready'), created_at: new Date().toISOString() },
        'jamie@example.com',
        ties
      );

      await expect(arranged.run()).resolves.toMatchObject({ status: 'sent', jobId: 'shared' });

      expect(arranged.fetch).toHaveBeenCalledTimes(1);
      expect(arranged.tables.show_lifecycle_email_jobs).toHaveLength(1);
    });

    it("an address change moves only THIS request's tie; the others find a skipped job (busy)", async () => {
      const arranged = arrangeStateful(sharedJob('ready'), 'new@example.com', ties);

      const result = await arranged.run();

      expect(result).toMatchObject({ status: 'sent' });
      const replacement = arranged.tables.show_lifecycle_email_jobs.find(
        row => row.id !== 'shared'
      );
      expect(replacement).toBeDefined();
      const tied = (key: string) =>
        arranged.tables[TIES].find(row => row.request_key === key)?.job_id;
      expect(tied(REQUEST_KEY)).toBe(replacement?.id);
      expect(tied('show-lifecycle-email:key-of-a')).toBe('shared');
      expect(tied('show-lifecycle-email:key-of-c')).toBe('shared');
      expect(statusOf(arranged.tables, 'shared')).toBe('skipped');
    });
  });

  describe("an address change on the request's own job", () => {
    const own = (extra: Record<string, unknown>) => ({
      ...earlierJob,
      id: 'mine',
      idempotency_key: REQUEST_KEY,
      request_key: REQUEST_KEY,
      recipient_email: 'old@example.com',
      ...extra,
    });

    it('answers busy, writing nothing, while an attempt on the job is active', async () => {
      const inFlight = own({
        status: 'ready',
        attempt_id: 'attempt-live',
        claimed_until: new Date(Date.now() + 60_000).toISOString(),
      });
      const { fetch, tables, run } = arrangeStateful(inFlight, 'new@example.com');

      await expect(run()).resolves.toEqual({ status: 'busy' });

      expect(fetch).not.toHaveBeenCalled();
      expect(tables.show_lifecycle_email_jobs).toHaveLength(1);
      expect(statusOf(tables, 'mine')).toBe('ready');
    });

    it('replaces an ABANDONED ready job (lease expired) at the new address', async () => {
      const stale = own({
        status: 'ready',
        attempt_id: 'attempt-dead',
        claimed_until: new Date(Date.now() - 1000).toISOString(),
      });
      const { tables, run, recipients } = arrangeStateful(stale, 'new@example.com');

      await expect(run()).resolves.toMatchObject({ status: 'sent' });

      expect(recipients()).toEqual(['new@example.com']);
      expect(statusOf(tables, 'mine')).toBe('skipped');
    });
  });
});
