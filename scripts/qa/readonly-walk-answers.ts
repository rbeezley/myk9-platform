/**
 * `answerLocally` (MYK9-2003): the Playwright wiring for the pure rules in
 * `readonly-walk-local.ts`. Only GETs ever leave the browser. A refused write
 * is answered from a real read of the same table with the request's own
 * filters and `select`, so PostgREST computes the columns, embeds and
 * optimistic-concurrency filters (`updated_at=eq.<ts>`); the body is laid over
 * the rows it returns. Every answer is recorded in `log.simulated`, which
 * `formatWalkLog` prints as the Simulated list.
 *
 * Nothing is remembered between requests: a row the walk created is not read
 * back by a later GET. A screen that reloads it shows the database as it is.
 *
 * Call AFTER `installReadOnlyGuard`: the route registered last is asked first.
 */
import type { APIResponse, BrowserContext, Route } from '@playwright/test';
import type { WalkLog } from './readonly-walk';
import {
  conflictQuery,
  contentRange,
  kindOf,
  overlayBody,
  parseSelect,
  readHeaders,
  resolutionOf,
  singleRowError,
  synthesizeRow,
  type Row,
} from './readonly-walk-local';

const isRow = (value: unknown): value is Row =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRows = (value: unknown): Row[] => (Array.isArray(value) ? value : [value]).filter(isRow);

const WRITES = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export async function answerLocally(
  context: BrowserContext,
  tables: readonly string[],
  log: WalkLog
): Promise<void> {
  const answered = new Set(tables);
  let made = 0;
  const makeId = () => `00000000-0000-4000-8000-${String(++made).padStart(12, '0')}`;

  await context.route(/\/rest\/v1\/[A-Za-z0-9_]+(\?|$)/, async (route: Route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const table = url.pathname.split('/').pop() ?? '';
    if (!answered.has(table) || !WRITES.has(method)) {
      await route.fallback();
      return;
    }
    const headers = request.headers();
    const prefer = headers['prefer'] ?? '';
    const wantsObject = (headers['accept'] ?? '').includes('vnd.pgrst.object');
    const items = parseSelect(url.searchParams.get('select'));
    const select = url.searchParams.get('select');
    let page = 'unknown page';
    try {
      page = request.frame().page().url();
    } catch {
      // a request with no frame is recorded without a page
    }

    /** A real GET. Null when it failed; the caller then answers with that failure. */
    const state: { failure: APIResponse | null } = { failure: null };
    const read = async (target: URL, strict = true): Promise<Row[] | null> => {
      const real = await context.request.get(target.toString(), { headers: readHeaders(headers) });
      if (!real.ok()) {
        if (strict) state.failure = real;
        return null;
      }
      return asRows(await real.json());
    };

    const send = async (status: number, rows: Row[]) => {
      const counted = /count=(exact|planned|estimated)/.test(prefer);
      if (wantsObject && rows.length !== 1) {
        await route.fulfill({
          status: 406,
          contentType: 'application/json',
          body: JSON.stringify(singleRowError(rows.length)),
        });
        return;
      }
      await route.fulfill({
        status,
        headers: { 'content-range': contentRange(rows.length, counted) },
        contentType: 'application/json',
        body: JSON.stringify(wantsObject ? rows[0] : rows),
      });
    };

    let parsed: unknown = {};
    try {
      parsed = JSON.parse(request.postData() ?? '{}');
    } catch {
      // a body that is not JSON is answered as an empty row
    }
    const incoming = asRows(parsed);
    const minimal = !prefer.includes('return=representation');
    const gaps: string[] = [];
    let synthesized = false;
    let result: Row[] = [];

    if (method === 'POST') {
      const resolution = resolutionOf(prefer);
      const onConflict = url.searchParams.get('on_conflict')?.split(',') ?? [];
      for (const body of incoming) {
        const query = resolution ? conflictQuery(body, onConflict, select) : null;
        const found = query ? await read(new URL(`${url.origin}${url.pathname}?${query}`)) : [];
        if (!found) break;
        if (found.length > 0) {
          if (resolution === 'merge-duplicates')
            result.push(...found.map(row => overlayBody(row, body, items)));
          continue;
        }
        synthesized = true;
        const made = await synthesizeRow(
          body,
          items,
          { id: makeId(), now: new Date().toISOString() },
          // An embed that failed to read is a gap, not a reason to refuse the save.
          async (embedTable, query) =>
            read(new URL(`${url.origin}/rest/v1/${embedTable}?${query}`), false)
        );
        result.push(made.row);
        gaps.push(...made.gaps);
      }
    } else {
      const rows = await read(url);
      if (rows) {
        result =
          method === 'DELETE' ? rows : rows.map(row => overlayBody(row, incoming[0] ?? {}, items));
      }
    }

    if (state.failure) {
      await route.fulfill({ response: state.failure });
      return;
    }
    log.simulated.push({ page, method, table, kind: kindOf(gaps, synthesized), gaps });
    if (minimal) await route.fulfill({ status: method === 'POST' ? 201 : 204, body: '' });
    else await send(method === 'POST' ? 201 : 200, result);
  });
}
