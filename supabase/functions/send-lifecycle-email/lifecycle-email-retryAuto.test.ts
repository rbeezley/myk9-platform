import { describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';
import { autoJob, makeAutoSendSupabase } from './lifecycle-email-autoSend.testUtils';

const secretaryRole = {
  auth_user_id: 'secretary-1',
  is_active: true,
  club_id: 'club-1',
  show_id: null,
  roles: { name: 'trial_secretary' },
};

function setup(userRoles: Array<Record<string, unknown>> = [secretaryRole]) {
  const fixture = makeAutoSendSupabase({
    shows: [
      { id: 'show-1', club_id: 'club-1' },
      { id: 'show-2', club_id: 'club-2' },
    ],
    user_roles: userRoles,
    show_lifecycle_email_jobs: [
      autoJob({ id: 'failed-1', status: 'failed', attempt_id: 'old', claimed_until: 'later' }),
      autoJob({ id: 'failed-2', status: 'failed', recipient_person_id: 'person-2' }),
      autoJob({ id: 'ready-1', status: 'ready', recipient_person_id: 'person-3' }),
      autoJob({ id: 'sent-1', status: 'sent', recipient_person_id: 'person-4' }),
      autoJob({
        id: 'by-hand',
        status: 'failed',
        auto_send: false,
        recipient_person_id: 'person-5',
      }),
      autoJob({ id: 'other-show', status: 'failed', show_id: 'show-2' }),
    ],
  });
  const fetch = vi.fn();
  const handler = createSendLifecycleEmailHandler({
    fetch: fetch as unknown as typeof globalThis.fetch,
    resendApiKey: 'resend-key',
  });
  const run = () =>
    handler({
      body: { action: 'retry_auto', show_id: 'show-1' },
      user: { id: 'secretary-1' },
      supabase: fixture.supabase,
    });
  const jobs = () =>
    Object.fromEntries(fixture.tables.show_lifecycle_email_jobs.map(j => [j.id, j]));
  return { run, jobs, fetch };
}

describe('retry_auto', () => {
  it('refuses a caller with no show role and changes nothing', async () => {
    const { run, jobs } = setup([]);

    await expect(run()).rejects.toMatchObject({ status: 403 });
    expect(jobs()['failed-1'].status).toBe('failed');
  });

  it("puts only this show's failed automatic jobs back to ready, due now and unleased", async () => {
    const { run, jobs, fetch } = setup();

    const result = await run();

    expect(result).toEqual({ retried: 2 });
    expect(jobs()['failed-1']).toMatchObject({
      status: 'ready',
      attempt_id: null,
      claimed_until: null,
    });
    expect(jobs()['failed-1'].due_at).not.toBe('2026-11-17T11:55:00.000Z');
    expect(jobs()['failed-2'].status).toBe('ready');
    // Everything else is left alone.
    expect(jobs()['ready-1'].due_at).toBe('2026-11-17T11:55:00.000Z');
    expect(jobs()['sent-1'].status).toBe('sent');
    expect(jobs()['by-hand'].status).toBe('failed');
    expect(jobs()['other-show'].status).toBe('failed');
    // It queues; the drain sends.
    expect(fetch).not.toHaveBeenCalled();
  });
});
