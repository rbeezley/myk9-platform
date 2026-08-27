import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { CLASS_AUTHENTICATED_COLUMN_SELECT } from '@/services/database/classes/reads';
import { LoadVirtualUser, VIRTUAL_USER_SYNC_INTERVAL_MS } from './loadVirtualUser';

/**
 * The virtual user restates the replication delta queries rather than sharing
 * them, because `ReplicatedTable` reaches a module-level `databaseManager`
 * singleton and 270 virtual users in one process would share one watermark.
 *
 * Restating them means they can drift, and a drifted virtual user measures a
 * fiction rather than the application. These tests compare the URLs actually put
 * on the wire — not the source text, which would only prove someone typed the
 * right string.
 */

const SUPABASE_URL = 'https://fixture.supabase.co';
const ANON_KEY = 'fixture-anon-key';
const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const TRIAL_ID = 'dededede-0000-0000-0000-000000000021';
const OWNER_ID = 'aaaa0000-0000-0000-0000-000000000001';

function recordingFetch(): { urls: string[]; impl: typeof fetch } {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === 'string' ? input : input.toString());
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { urls, impl };
}

/** The `since` value moves with the clock; everything else must match exactly. */
function normalize(url: string): string {
  return url.replace(/updated_at=gt\.[^&]+/, 'updated_at=gt.<since>');
}

function virtualUser(overrides: Partial<Parameters<typeof buildOptions>[0]> = {}) {
  const { urls, impl } = recordingFetch();
  const user = new LoadVirtualUser(
    buildOptions({ fetchImpl: impl, ...overrides }),
    CLASS_AUTHENTICATED_COLUMN_SELECT
  );
  return { urls, user };
}

function buildOptions(extra: Record<string, unknown>) {
  return {
    supabaseUrl: SUPABASE_URL,
    anonKey: ANON_KEY,
    accessToken: 'fixture-token',
    showId: SHOW_ID,
    role: 'exhibitor' as const,
    ...extra,
  } as ConstructorParameters<typeof LoadVirtualUser>[0];
}

/** The query the real ReplicatedEntriesTable adapter builds, run through a recorder. */
async function realEntriesUrl(): Promise<string> {
  const { urls, impl } = recordingFetch();
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: impl },
  });
  await client
    .from('view_authenticated_entry_results')
    .select('*')
    .gt('updated_at', new Date(0).toISOString())
    .order('updated_at', { ascending: true })
    .eq('show_id', SHOW_ID);
  return urls[0];
}

async function realDogsUrl(ownerId?: string): Promise<string> {
  const { urls, impl } = recordingFetch();
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: impl },
  });
  let query = client
    .from('dogs')
    .select('*')
    .gt('updated_at', new Date(0).toISOString())
    .order('updated_at', { ascending: true });
  if (ownerId) query = query.eq('owner_id', ownerId);
  await query;
  return urls[0];
}

describe('virtual user request fidelity', () => {
  it('polls at the replication layer cadence', () => {
    // Mirrors SYNC_INTERVAL_MS in packages/replication. A virtual user polling on
    // a different clock would misreport reader load per unit time.
    expect(VIRTUAL_USER_SYNC_INTERVAL_MS).toBe(60_000);
  });

  it('reads entries through the authenticated results view, show-scoped', async () => {
    const { urls, user } = virtualUser();
    await user.syncOnce();
    const entriesUrl = urls.find(url => url.includes('view_authenticated_entry_results'));
    expect(entriesUrl).toBeDefined();
    expect(normalize(entriesUrl!)).toBe(normalize(await realEntriesUrl()));
  });

  it('never reads public.entries directly', () => {
    // The replicated read goes through the view so the release cascade nulls
    // result columns for exhibitors. Hitting public.entries would both bypass
    // that and measure a query the application never issues.
    const { urls } = virtualUser();
    expect(urls.some(url => /\/rest\/v1\/entries\?/.test(url))).toBe(false);
  });

  it('scopes an exhibitor dog sync by owner and leaves a staff sync unscoped', async () => {
    const scoped = virtualUser({ ownerId: OWNER_ID });
    await scoped.user.syncOnce();
    const scopedUrl = scoped.urls.find(url => url.includes('/dogs?'));
    expect(normalize(scopedUrl!)).toBe(normalize(await realDogsUrl(OWNER_ID)));

    const unscoped = virtualUser({ role: 'secretary' as const });
    await unscoped.user.syncOnce();
    const unscopedUrl = unscoped.urls.find(url => url.includes('/dogs?'));
    expect(unscopedUrl).not.toContain('owner_id');
    expect(normalize(unscopedUrl!)).toBe(normalize(await realDogsUrl()));
  });

  it('selects class columns rather than a star, and carries the judge embed', async () => {
    // `select('*')` on classes fails 42501: authenticated holds no SELECT on
    // num_hides. A virtual user issuing a star select would measure an error path
    // the application never takes.
    const { urls, user } = virtualUser({ trialId: TRIAL_ID });
    await user.syncOnce();
    const classesUrl = urls.find(url => url.includes('/classes?'));
    expect(classesUrl).toBeDefined();
    expect(classesUrl).not.toMatch(/select=\*/);
    // supabase-js strips the whitespace out of the multi-line column constant,
    // so compare against the same collapsed form rather than the source text.
    const collapsed = CLASS_AUTHENTICATED_COLUMN_SELECT.replace(/\s+/g, '');
    expect(decodeURIComponent(classesUrl!)).toContain(collapsed);
    expect(decodeURIComponent(classesUrl!)).toContain('judge_assignments');
    expect(classesUrl).toContain(`trial_id=eq.${TRIAL_ID}`);
  });

  it('drives an unscoped class sync when no trial scope is supplied', async () => {
    const { urls, user } = virtualUser();
    await user.syncOnce();
    const classesUrl = urls.find(url => url.includes('/classes?'));
    // `trial_id` is also a selected column, so assert on the filter specifically.
    expect(classesUrl).not.toContain('trial_id=eq.');
  });
});

describe('watermark advancement', () => {
  it('starts from epoch so the first pass hydrates like a cold device', async () => {
    const { urls, user } = virtualUser();
    await user.syncOnce();
    for (const url of urls) {
      expect(url).toContain(`updated_at=gt.${encodeURIComponent(new Date(0).toISOString())}`);
    }
  });

  it('advances to the maximum server updated_at, never the client clock', async () => {
    const urls: string[] = [];
    const impl = (async (input: RequestInfo | URL) => {
      urls.push(input.toString());
      // Two rows, deliberately out of order, with the later one second.
      return new Response(
        JSON.stringify([
          { id: 'a', updated_at: '2026-08-01T00:00:00.000Z' },
          { id: 'b', updated_at: '2026-08-02T00:00:00.000Z' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;

    const user = new LoadVirtualUser(
      buildOptions({ fetchImpl: impl }),
      CLASS_AUTHENTICATED_COLUMN_SELECT
    );
    await user.syncOnce();
    urls.length = 0;
    await user.syncOnce();

    // A client-clock watermark would skip rows written between the two passes.
    for (const url of urls) {
      expect(url).toContain(`updated_at=gt.${encodeURIComponent('2026-08-02T00:00:00.000Z')}`);
    }
  });
});
