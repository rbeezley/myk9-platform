import { describe, expect, it, vi } from 'vitest';
import { createLifecycleEmailRoute } from './lifecycle-email-route';
import { autoJob, makeAutoSendSupabase, publishedShow } from './lifecycle-email-autoSend.testUtils';

function route(env: Record<string, string> = { HERITAGE_CONFIRMATION_SECRET: 'cron-secret' }) {
  return createLifecycleEmailRoute(
    {
      fetch: vi.fn(async () => ({
        ok: true,
        json: async () => ({ id: 'resend-1' }),
      })) as unknown as typeof globalThis.fetch,
      resendApiKey: 'resend-key',
    },
    name => env[name]
  );
}

function request(headers: Record<string, string>) {
  return new Request('https://example.test/functions/v1/send-lifecycle-email', {
    method: 'POST',
    headers,
  });
}

function fixture() {
  const { supabase } = makeAutoSendSupabase(
    { shows: [publishedShow], show_lifecycle_email_jobs: [autoJob()] },
    { liveEntryPeople: ['person-1'] }
  );
  return {
    ...supabase,
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
  };
}

describe('send-lifecycle-email route', () => {
  it('drains for the cron secret, with no user', async () => {
    const result = await route()({
      req: request({ 'x-function-secret': 'cron-secret', Authorization: 'Bearer service-key' }),
      body: { action: 'drain_auto' },
      supabase: fixture(),
    });
    expect(result).toMatchObject({ claimed: 1, sent: 1 });
  });

  it('refuses a drain with the wrong or missing secret', async () => {
    const wrongOrMissing: Array<Record<string, string>> = [{ 'x-function-secret': 'nope' }, {}];
    for (const headers of wrongOrMissing) {
      await expect(
        route()({ req: request(headers), body: { action: 'drain_auto' }, supabase: fixture() })
      ).rejects.toMatchObject({ status: 401 });
    }
  });

  it('refuses a drain when the secret is not configured', async () => {
    await expect(
      route({})({
        req: request({ 'x-function-secret': 'cron-secret' }),
        body: { action: 'drain_auto' },
        supabase: fixture(),
      })
    ).rejects.toMatchObject({ status: 503 });
  });

  it('keeps every other action behind a signed-in user', async () => {
    const supabase = fixture();
    await expect(
      route()({ req: request({}), body: { action: 'send', show_id: 'show-1' }, supabase })
    ).rejects.toMatchObject({ status: 401 });
    // The cron secret alone does not let a caller run a secretary's action.
    await expect(
      route()({
        req: request({ 'x-function-secret': 'cron-secret', Authorization: 'Bearer service-key' }),
        body: { action: 'send', show_id: 'show-1' },
        supabase,
      })
    ).rejects.toMatchObject({ status: 401 });
    expect(supabase.auth.getUser).toHaveBeenCalledWith('service-key');
  });
});
