// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createSendLifecycleEmailHandler } from './lifecycle-email-handler';
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
