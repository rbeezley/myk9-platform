import { describe, expect, it, vi } from 'vitest';
import { LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT } from './loadClassColumns';
import { LoadVirtualUser, VIRTUAL_USER_SYNC_INTERVAL_MS } from './loadVirtualUser';
import {
  createFakePostgrest,
  FIXTURE_ANON_KEY,
  FIXTURE_URL,
  normalizeRequest,
} from './loadVirtualUser.fixtures';

/**
 * Behaviour of the virtual reader that the fidelity test cannot see: what moves its
 * watermarks, when the follow-up reads fire, and the tick guard. What it ASKS for,
 * table by table, is pinned against the application in
 * `loadVirtualUser.fidelity.test.ts`.
 */

function reader(fetchImpl: typeof fetch) {
  return new LoadVirtualUser(
    {
      supabaseUrl: FIXTURE_URL,
      anonKey: FIXTURE_ANON_KEY,
      accessToken: 'fixture-token',
      role: 'exhibitor',
      fetchImpl,
    },
    LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT
  );
}

const emptyServer = (urls: string[]) =>
  (async (input: RequestInfo | URL) => {
    urls.push(input.toString());
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;

const epoch = encodeURIComponent(new Date(0).toISOString());

describe('request set', () => {
  it('starts every delta from epoch so the first pass hydrates like a cold device', async () => {
    const urls: string[] = [];
    await reader(emptyServer(urls)).syncOnce();

    const deltas = urls.filter(url => url.includes('updated_at=gt.'));
    // shows, trials, classes, dogs, clubs, waitlist, dog_registrations, judge_assignments
    expect(deltas).toHaveLength(8);
    for (const url of deltas) expect(url).toContain(`updated_at=gt.${epoch}`);
  });

  it('downloads every unavailable armband on every pass, as the app does', async () => {
    const urls: string[] = [];
    const user = reader(emptyServer(urls));
    await user.syncOnce();
    await user.syncOnce();

    const armbands = urls.filter(url => url.includes('/armbands?'));
    expect(armbands).toHaveLength(2);
    for (const url of armbands) expect(url).not.toContain('updated_at');
  });

  it('runs the class enrichment reads only when the classes delta returns rows', async () => {
    const quiet = createFakePostgrest();
    const empty: string[] = [];
    await reader(emptyServer(empty)).syncOnce();
    expect(empty.some(url => url.includes('get_show_judges'))).toBe(false);
    expect(empty.some(url => url.includes('sport_class_rules'))).toBe(false);

    // The fixture server answers the classes delta with one class.
    await reader(quiet.fetch).syncOnce();
    const enriched = quiet.requests.map(normalizeRequest);
    expect(enriched.some(line => line.includes('/rpc/get_show_judges'))).toBe(true);
    expect(enriched.some(line => line.includes('/rpc/get_show_class_hide_counts'))).toBe(true);
    expect(enriched.filter(line => line.includes('/sport_class_rules'))).toHaveLength(2);
  });

  it('continues a table after a failed count, but not after a failed delta', async () => {
    const failing = createFakePostgrest({ failTable: 'judge_assignments' });
    const samples = (await reader(failing.fetch).syncOnce()).samples.filter(sample =>
      sample.table.startsWith('judge_assignments')
    );
    // The count and the delta both fail here, and nothing follows them.
    expect(samples.map(sample => sample.ok)).toEqual([false, false]);
  });

  it('labels each sample with its table and counts the rows a pass downloaded', async () => {
    const server = createFakePostgrest();
    const result = await reader(server.fetch).syncOnce();

    expect(result.samples.length).toBe(server.requests.length);
    expect(new Set(result.samples.map(sample => sample.table.split(' ')[0]))).toEqual(
      new Set([
        'shows',
        'trials',
        'classes',
        'dogs',
        'dog_registrations',
        'clubs',
        'judge_assignments',
        'armbands',
        'waitlist_entries',
      ])
    );
    // The fixture's one class is the only row on the server.
    expect(result.rows).toBe(1);
  });
});

describe('watermark advancement', () => {
  function datedServer(urls: string[]) {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(`${init?.method ?? 'GET'} ${input.toString()}`);
      if ((init?.method ?? 'GET') === 'HEAD') return new Response(null, { status: 200 });
      // Two rows, deliberately out of order, with the later one second.
      return new Response(
        JSON.stringify([
          { id: 'a', trial_id: null, updated_at: '2026-08-01T00:00:00.000Z' },
          { id: 'b', trial_id: null, updated_at: '2026-08-02T00:00:00.000Z' },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
  }

  it('advances to the maximum server updated_at, never the client clock, less the overlap', async () => {
    const urls: string[] = [];
    const user = reader(datedServer(urls));
    await user.syncOnce();
    urls.length = 0;
    await user.syncOnce();

    const latest = Date.parse('2026-08-02T00:00:00.000Z');
    const since = (offsetMs: number) =>
      `updated_at=gt.${encodeURIComponent(new Date(latest - offsetMs).toISOString())}`;
    // Each table re-reads a little before its watermark, so a row committed late
    // behind it is not missed: five seconds for classes, a minute for the rest.
    expect(urls.find(url => url.includes('/classes?') && url.startsWith('GET'))).toContain(
      since(5_000)
    );
    expect(urls.find(url => url.includes('/dogs?select=*'))).toContain(since(60_000));
    expect(urls.find(url => url.includes('/shows?') && url.startsWith('GET'))).toContain(
      since(60_000)
    );
  });

  it('leaves a watermark alone when a pass fails', async () => {
    const urls: string[] = [];
    let failing = false;
    const flaky = (async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(input.toString());
      if (failing) return new Response('{}', { status: 500 });
      return datedServer([])(input, init);
    }) as unknown as typeof fetch;
    const user = reader(flaky);
    await user.syncOnce();
    failing = true;
    await user.syncOnce();
    failing = false;
    urls.length = 0;
    await user.syncOnce();

    // The failed pass advanced nothing, so the next one asks from the same place.
    const latest = Date.parse('2026-08-02T00:00:00.000Z');
    expect(urls.find(url => url.includes('/dogs?select=*'))).toContain(
      `updated_at=gt.${encodeURIComponent(new Date(latest - 60_000).toISOString())}`
    );
  });
});

describe('tick guard', () => {
  it('sends nothing new while a pass is waiting on the database', async () => {
    vi.useFakeTimers();
    try {
      const releases: (() => void)[] = [];
      let issued = 0;
      const slow = (async () => {
        issued += 1;
        return new Promise<Response>(resolve => {
          releases.push(() =>
            resolve(
              new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
            )
          );
        });
      }) as unknown as typeof fetch;
      const user = reader(slow);

      user.start(() => {});
      vi.advanceTimersByTime(VIRTUAL_USER_SYNC_INTERVAL_MS);
      for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
      const issuedByFirstPass = issued;
      expect(issuedByFirstPass).toBeGreaterThan(0);

      // Two more minutes of a database that has not answered: the app would issue
      // nothing, so neither does the reader.
      vi.advanceTimersByTime(2 * VIRTUAL_USER_SYNC_INTERVAL_MS);
      for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
      expect(issued).toBe(issuedByFirstPass);
      expect(user.skippedPasses).toBe(2);

      user.stop();
      for (const release of releases) release();
      await user.drain();
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs a fresh pass once the database answers and the next tick arrives', async () => {
    vi.useFakeTimers();
    try {
      const server = createFakePostgrest();
      const user = reader(server.fetch);
      const passes = vi.fn();

      user.start(passes);
      vi.advanceTimersByTime(VIRTUAL_USER_SYNC_INTERVAL_MS);
      await vi.advanceTimersByTimeAsync(0);
      for (let tick = 0; tick < 100; tick += 1) await Promise.resolve();
      expect(passes).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(VIRTUAL_USER_SYNC_INTERVAL_MS);
      for (let tick = 0; tick < 100; tick += 1) await Promise.resolve();
      expect(passes).toHaveBeenCalledTimes(2);
      expect(user.skippedPasses).toBe(0);

      user.stop();
      await user.drain();
    } finally {
      vi.useRealTimers();
    }
  });
});
