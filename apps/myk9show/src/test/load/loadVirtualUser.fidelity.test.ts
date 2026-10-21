import { createDatabaseError } from '@/services/database/databaseError';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  databaseManager,
  REPLICATION_INCREMENTAL_BUFFER_MS,
  REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN,
  DEFAULT_REMOTE_COUNT_INTERVAL_MS,
  shouldCountRemoteRows,
} from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { CLASS_AUTHENTICATED_COLUMN_SELECT } from '@/services/database/classes/reads';
import { REPLICATED_TABLES } from '@/providers/ReplicationSyncProvider';
import { LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT } from './loadClassColumns';
import {
  LoadVirtualUser,
  REMOTE_COUNT_INTERVAL_MS,
  VIRTUAL_USER_SYNC_INTERVAL_MS,
} from './loadVirtualUser';
import {
  INCREMENTAL_BUFFER_MS,
  INCREMENTAL_BUFFER_MS_HIGH_CHURN,
  READER_TABLE_PASSES,
} from './loadVirtualUserTables';
import {
  createFakePostgrest,
  FIXTURE_ANON_KEY,
  FIXTURE_URL,
  normalizeRequest,
  type FakePostgrest,
  type FakePostgrestOptions,
} from './loadVirtualUser.fixtures';

/**
 * The virtual reader restates the replication queries rather than sharing them,
 * because `ReplicatedTable` reaches a module-level `databaseManager` singleton and
 * 248 virtual users in one process would share one watermark.
 *
 * Restating them means they can drift, and a drifted reader measures a fiction. So
 * nothing here writes down what the application "should" send. The REAL replicated
 * tables run one pass of the app's poll against a recording server, the virtual
 * reader runs one pass against an identical one, and the two request sets must be
 * equal. Breaking either side turns this red.
 */

// The application's client is replaced by a real one whose transport is the
// recording server; everything above the transport (builders, engine, adapters,
// enrichment resolvers) is the production code.
const wire = vi.hoisted(() => ({ fetch: undefined as unknown as typeof fetch }));
vi.mock('@/services/database/supabaseClient', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient('https://fixture.supabase.co', 'fixture-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => wire.fetch(...args) },
  });
  return {
    supabase: client,
    publicSupabase: client,
    default: client,
    signOut: vi.fn(),
    logQuery: vi.fn(),
    createDatabaseError,
    getConnectionInfo: vi.fn(() => ({ url: 'https://fixture.supabase.co', hasValidConfig: true })),
  };
});

/** The provider's own list, so a table added there is in the capture the moment it exists. */
const APP_POLL_TABLES = REPLICATED_TABLES.map(({ table }) => table);

/** The provider's untargeted pass: every table's `sync` with the app's empty scope, at once. */
async function captureAppPass(options: FakePostgrestOptions = {}): Promise<string[]> {
  const server = createFakePostgrest(options);
  wire.fetch = server.fetch;
  const results = await Promise.all(APP_POLL_TABLES.map(table => table.sync('')));
  if (!options.failTable) {
    // A pass that failed part-way would silently shorten the request set.
    expect(results.filter(result => !result.success).map(result => result.tableName)).toEqual([]);
  }
  return server.requests.map(normalizeRequest).sort();
}

async function captureVirtualPass(
  role: 'exhibitor' | 'secretary',
  options: FakePostgrestOptions = {}
): Promise<{ requests: string[]; server: FakePostgrest }> {
  const server = createFakePostgrest(options);
  const user = new LoadVirtualUser(
    {
      supabaseUrl: FIXTURE_URL,
      anonKey: FIXTURE_ANON_KEY,
      accessToken: `fixture-${role}-token`,
      role,
      fetchImpl: server.fetch,
    },
    LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT
  );
  await user.syncOnce();
  return { requests: server.requests.map(normalizeRequest).sort(), server };
}

beforeEach(async () => {
  await databaseManager.reset();
  // The clubs table reconciles only for a signed-in (non-anonymous) account.
  vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
    data: { session: { user: { id: 'user-test', is_anonymous: false } } },
    error: null,
  } as never);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await databaseManager.reset();
});

describe("virtual reader replays the application's real poll", () => {
  it.each(['exhibitor', 'secretary'] as const)(
    'puts the same requests on the wire as one app pass for a %s',
    async role => {
      const app = await captureAppPass();
      const virtual = await captureVirtualPass(role);

      expect(virtual.requests).toEqual(app);
    }
  );

  it('proves the capture reaches the follow-up reads, not just the first query per table', async () => {
    // Guards the comparison against passing vacuously: an app pass that stopped
    // after the deltas would match a reader that did the same.
    const app = (await captureAppPass()).join('\n');

    expect(app).toContain('HEAD /rest/v1/shows');
    expect(app).toContain('HEAD /rest/v1/clubs');
    expect(app).toMatch(/GET \/rest\/v1\/dogs .*select=id(\n|$)/);
    expect(app).toMatch(/GET \/rest\/v1\/dog_registrations .*select=id(\n|$)/);
    expect(app).toContain('POST /rest/v1/rpc/get_show_judges');
    expect(app).toContain('POST /rest/v1/rpc/get_show_class_hide_counts');
    expect(app).toContain('GET /rest/v1/sport_class_rules');
    expect(app).toContain('GET /rest/v1/armbands');
  });

  it('does not read the entries view on the poll', async () => {
    // The poll is unscoped, and the entries table returns without a show scope.
    // The per-show entries sync, which does read the view, belongs to the at-show
    // pages. A reader that polled it would measure a query the poll never makes.
    const virtual = (await captureVirtualPass('exhibitor')).requests.join('\n');
    expect(virtual).not.toContain('view_authenticated_entry_results');
    expect(virtual).not.toMatch(/\/rest\/v1\/entries/);
  });

  it('applies no trial, owner or show scope to any read, as the poll applies none', async () => {
    const virtual = (await captureVirtualPass('secretary')).requests;
    for (const request of virtual) {
      expect(request).not.toMatch(/(^|&)(trial_id|owner_id|show_id)=eq\./);
    }
  });

  it('pages the dogs id scan exactly as the application does', async () => {
    const options = { fullDogIdPage: true };
    const app = await captureAppPass(options);
    const virtual = await captureVirtualPass('exhibitor', options);

    expect(app.filter(line => /\/rest\/v1\/dogs .*select=id$/.test(line))).toHaveLength(2);
    expect(virtual.requests).toEqual(app);
  });

  it('stops after a failed dogs delta on both sides, with no id scan', async () => {
    const options = { failTable: 'dogs' };
    const app = await captureAppPass(options);
    const virtual = await captureVirtualPass('exhibitor', options);

    // Only the failed delta: the id scan that follows a good download never ran.
    expect(app.filter(line => line.includes('/rest/v1/dogs'))).toHaveLength(1);
    expect(virtual.requests).toEqual(app);
  });

  it('stops after a failed clubs delta on both sides, with no visibility reconcile', async () => {
    const options = { failTable: 'clubs' };
    const app = await captureAppPass(options);
    const virtual = await captureVirtualPass('secretary', options);

    expect(virtual.requests).toEqual(app);
    expect(app.filter(line => line.includes('/rest/v1/clubs'))).toHaveLength(1);
  });

  it('accounts for every table the provider syncs, so a new one cannot go unmirrored', () => {
    // These three issue nothing on the unscoped poll (see loadVirtualUserTables.ts).
    const silent = ['entries', 'people', 'paperwork_prints'];
    const mirrored = READER_TABLE_PASSES.map(pass => pass.table);

    expect([...mirrored, ...silent].sort()).toEqual(REPLICATED_TABLES.map(t => t.name).sort());
  });
});

describe('constants the reader copies from the application', () => {
  it("keeps the harness class column list identical to the application's", () => {
    // The harness holds a copy because importing the real constant pulls in
    // supabaseClient, which reads import.meta.env and breaks Playwright
    // discovery. This is what stops the copy drifting into a query the
    // application never issues.
    expect(LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT).toBe(CLASS_AUTHENTICATED_COLUMN_SELECT);
  });

  it('polls at the replication layer cadence', async () => {
    const { SYNC_INTERVAL_MS } = await import('@myk9/replication');
    expect(VIRTUAL_USER_SYNC_INTERVAL_MS).toBe(SYNC_INTERVAL_MS);
  });

  it('overlaps each delta with the same buffer the engine uses', () => {
    expect(INCREMENTAL_BUFFER_MS).toBe(REPLICATION_INCREMENTAL_BUFFER_MS);
    expect(INCREMENTAL_BUFFER_MS_HIGH_CHURN).toBe(REPLICATION_INCREMENTAL_BUFFER_MS_HIGH_CHURN);
  });
});

// MYK9-1301: the engine counts on a cadence, so the reader must, or the
// before/after rehearsal measures a count the app no longer sends.
describe("virtual reader follows the engine's count cadence", () => {
  const COUNTED_TABLES = ['shows', 'trials', 'classes', 'judge_assignments', 'waitlist_entries'];

  async function countHeads(passMinutes: number[], countEveryPass: boolean): Promise<number> {
    const server = createFakePostgrest();
    const user = new LoadVirtualUser(
      {
        supabaseUrl: FIXTURE_URL,
        anonKey: FIXTURE_ANON_KEY,
        accessToken: 'fixture-secretary-token',
        role: 'secretary',
        fetchImpl: server.fetch,
        countEveryPass,
      },
      LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT
    );
    const realNow = Date.now();
    const clock = vi.spyOn(Date, 'now');
    for (const minute of passMinutes) {
      clock.mockReturnValue(realNow + minute * 60_000);
      await user.syncOnce();
    }
    return server.requests
      .map(normalizeRequest)
      .filter(request => COUNTED_TABLES.some(t => request.startsWith(`HEAD /rest/v1/${t}`))).length;
  }

  const minutes = Array.from({ length: 12 }, (_, i) => i);

  it('shares the engine interval', () => {
    expect(REMOTE_COUNT_INTERVAL_MS).toBe(DEFAULT_REMOTE_COUNT_INTERVAL_MS);
    expect(
      shouldCountRemoteRows({
        lastCountedAt: 1,
        now: 1 + REMOTE_COUNT_INTERVAL_MS,
        intervalMs: DEFAULT_REMOTE_COUNT_INTERVAL_MS,
        countEveryPass: false,
        reconnectEpoch: 0,
        lastCountedEpoch: 0,
        previousDeltaWasFullPage: false,
      })
    ).toBe(true);
  });

  it('counts twice across 11 simulated minutes: the first pass and after the interval', async () => {
    expect(await countHeads(minutes, false)).toBe(2 * COUNTED_TABLES.length);
  });

  it('counts on every pass when the flag is off', async () => {
    expect(await countHeads(minutes, true)).toBe(minutes.length * COUNTED_TABLES.length);
  });
});
