/**
 * A recording stand-in for PostgREST, shared by the fidelity test's two sides: the
 * application's real replicated tables and the harness's virtual reader both talk
 * to one of these, so any difference in what they ask for is theirs alone.
 *
 * It answers just enough for every follow-up read to fire. The classes delta
 * returns one class, because a delta with rows is what triggers the enrichment
 * reads; the enrichment trial lookups return that class's trial; everything else
 * is an empty, successful answer.
 */

export const FIXTURE_URL = 'https://fixture.supabase.co';
export const FIXTURE_ANON_KEY = 'fixture-anon-key';
export const FIXTURE_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
export const FIXTURE_TRIAL_ID = 'dededede-0000-0000-0000-000000000021';
export const FIXTURE_CLASS_ID = 'dededede-0000-0000-0000-000000000031';

export interface FakePostgrestOptions {
  /** Answer the first dogs id scan with a full page, so the scan must page. */
  readonly fullDogIdPage?: boolean;
  /** Fail every request to this table with a 500. */
  readonly failTable?: string;
  /**
   * Answer every counted table's delta with one row, so the reader's replica is
   * not empty (an empty replica forces a count on every pass, as the engine does).
   */
  readonly seedCountedTables?: boolean;
}

const COUNTED_TABLES = ['shows', 'trials', 'classes', 'judge_assignments', 'waitlist_entries'];

export interface FakePostgrest {
  readonly fetch: typeof fetch;
  /** `METHOD url` (plus the body of a write) per request, in arrival order. */
  readonly requests: string[];
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

function pad(index: number): string {
  return `aaaaaaaa-0000-0000-0000-${String(index).padStart(12, '0')}`;
}

export function createFakePostgrest(options: FakePostgrestOptions = {}): FakePostgrest {
  const requests: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const url = new URL(typeof input === 'string' ? input : input.toString());
    requests.push(
      method === 'GET' || method === 'HEAD'
        ? `${method} ${url.pathname}${url.search}`
        : `${method} ${url.pathname}${url.search} ${String(init?.body ?? '')}`
    );
    const table = url.pathname.replace('/rest/v1/', '').split('/')[0];
    if (table === options.failTable) return json({ message: 'fixture failure' }, 500);
    if (options.seedCountedTables && method === 'GET' && COUNTED_TABLES.includes(table)) {
      return json([{ id: `${table}-seed`, updated_at: '2026-01-01T00:00:00.000Z' }]);
    }
    // Head count: the engine only needs the header.
    if (method === 'HEAD')
      return new Response(null, { status: 200, headers: { 'Content-Range': '*/0' } });
    const select = url.searchParams.get('select') ?? '';
    const isDelta = url.search.includes('updated_at=gt.') || url.search.includes('updated_at.gt.');
    if (table === 'trials' && select !== '*') {
      return json([{ id: FIXTURE_TRIAL_ID, show_id: FIXTURE_SHOW_ID, registry_id: 'AKC' }]);
    }
    if (table === 'classes' && isDelta) {
      return json([
        {
          id: FIXTURE_CLASS_ID,
          trial_id: FIXTURE_TRIAL_ID,
          name: 'Fixture class',
          element: 'Container',
          level: 'Novice',
          status: 'open',
          allow_waitlist: false,
          updated_at: '2026-10-01T12:00:00.000Z',
          judge_assignments: [],
        },
      ]);
    }
    if (table === 'dogs' && select === 'id' && options.fullDogIdPage) {
      return json(
        url.searchParams.has('id')
          ? []
          : Array.from({ length: 1000 }, (_, index) => ({ id: pad(index) }))
      );
    }
    return json([]);
  }) as typeof fetch;
  return { fetch: fakeFetch, requests };
}

/**
 * The parts of a request that are the same on every run and every side: host and
 * credentials gone, query parameters sorted (their order carries no meaning) and
 * every timestamp watermark replaced.
 */
export function normalizeRequest(line: string): string {
  const [method, target, ...body] = line.split(' ');
  const url = new URL(target, FIXTURE_URL);
  const params = [...url.searchParams.entries()]
    .map(
      ([key, value]) =>
        `${key}=${value.replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<ts>').replace(/\s+/g, '')}`
    )
    .sort();
  return [method, url.pathname, params.join('&'), ...body].join(' ');
}
