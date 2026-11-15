import { describe, expect, it, vi } from 'vitest';
import {
  createSendLifecycleEmailHandler,
  type LifecycleEmailSupabaseClient,
} from './lifecycle-email-handler';
import { baseTables, makeSupabase, readyJob } from './lifecycle-email-handler.testUtils';

// MYK9-1974: the send re-reads the entry and sends a decision email only while the entry
// still has the decision the email announces. Every Resend call here is a mock.

const acceptanceJob = { ...readyJob, entry_id: 'entry-1' };

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    show_id: 'show-1',
    registration_id: 'reg-1',
    dog_id: 'dog-1',
    handler: 'Jamie Handler',
    entry_status: 'accepted',
    deleted_at: null,
    ...overrides,
  };
}

function setup(tables: Record<string, Array<Record<string, unknown>>>) {
  const fake = makeSupabase(baseTables(tables));
  const fetch = vi.fn(async () => Response.json({ id: 'resend-1' }));
  const handler = createSendLifecycleEmailHandler({
    fetch: fetch as unknown as typeof globalThis.fetch,
    resendApiKey: 'resend-key',
  });
  const send = (supabase: LifecycleEmailSupabaseClient = fake.supabase) =>
    handler({
      body: { action: 'send', show_id: 'show-1', job_ids: ['job-1'] },
      user: { id: 'secretary-1' },
      supabase,
    });
  return { ...fake, fetch, send };
}

function jobUpdates(calls: Array<{ table: string; action: string; value?: unknown }>) {
  return calls.filter(
    call => call.table === 'show_lifecycle_email_jobs' && call.action === 'update'
  );
}

describe('send-lifecycle-email: the decision must still hold when it sends (MYK9-1974)', () => {
  it('skips an acceptance whose entry another operator has since waitlisted, and records why', async () => {
    const { calls, fetch, send } = setup({
      show_lifecycle_email_jobs: [acceptanceJob],
      entries: [entry({ entry_status: 'waitlist' })],
    });

    const result = await send();

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ attempted: 1, sent: 0, failed: 0, skipped: 1 });
    expect(result).toMatchObject({
      results: [{ jobId: 'job-1', status: 'skipped', reason: 'superseded' }],
    });
    expect(jobUpdates(calls)).toEqual([
      expect.objectContaining({
        value: expect.objectContaining({
          status: 'skipped',
          skipped_at: expect.any(String),
          // Released, so a later real return to this decision can save its own email.
          idempotency_key: 'idem-job-1:superseded:job-1',
          updated_by: 'secretary-1',
        }),
      }),
    ]);
    expect(calls).not.toContainEqual(expect.objectContaining({ table: 'email_log' }));
  });

  it('skips an acceptance whose entry was withdrawn since', async () => {
    const { fetch, send } = setup({
      show_lifecycle_email_jobs: [acceptanceJob],
      entries: [entry({ entry_status: 'withdrawn' })],
    });

    await expect(send()).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends once when the entry still has the decision', async () => {
    const { calls, fetch, send } = setup({
      show_lifecycle_email_jobs: [acceptanceJob],
      entries: [entry()],
    });

    await expect(send()).resolves.toMatchObject({ attempted: 1, sent: 1, skipped: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(jobUpdates(calls)).toEqual([
      expect.objectContaining({ value: expect.objectContaining({ status: 'sent' }) }),
    ]);
  });

  it('sends a waitlist email while the entry is still waitlisted', async () => {
    const { fetch, send } = setup({
      show_lifecycle_email_jobs: [{ ...acceptanceJob, step_type: 'waitlisted' }],
      entries: [entry({ entry_status: 'waitlist' })],
    });

    await expect(send()).resolves.toMatchObject({ sent: 1, skipped: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('still sends after the entry was deleted inside the Undo window (MYK9-1833)', async () => {
    const { fetch, send } = setup({
      show_lifecycle_email_jobs: [acceptanceJob],
      entries: [entry({ entry_status: 'withdrawn', deleted_at: '2026-11-14T20:00:00Z' })],
    });

    await expect(send()).resolves.toMatchObject({ sent: 1, skipped: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('skips a registration email when any class it names has a new decision', async () => {
    const { fetch, send } = setup({
      show_lifecycle_email_jobs: [
        {
          ...acceptanceJob,
          idempotency_key:
            'show-lifecycle-email:show-1:accepted:enrollment:reg-1:decided:entry-1,entry-2:entry-1',
        },
      ],
      entries: [entry(), entry({ id: 'entry-2', entry_status: 'waitlist' })],
    });

    await expect(send()).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends nothing and fails the request when the entry cannot be read', async () => {
    const { calls, fetch, send, supabase } = setup({
      show_lifecycle_email_jobs: [acceptanceJob],
      entries: [entry()],
    });
    const failingEntries = {
      ...supabase,
      from: (table: string) => {
        if (table !== 'entries') return supabase.from(table);
        const query = {
          select: () => query,
          in: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }),
        };
        return query as unknown as ReturnType<LifecycleEmailSupabaseClient['from']>;
      },
    };

    await expect(send(failingEntries)).rejects.toMatchObject({
      status: 500,
      message: 'Failed to check the entry status for this email',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(jobUpdates(calls)).toEqual([]);
    expect(calls).not.toContainEqual(expect.objectContaining({ table: 'email_log' }));
  });
});
