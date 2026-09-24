/**
 * Serving synthesized PostgREST responses from `page.route`. Shared by the
 * hermetic fixtures (exhibitorFixture.ts, secretaryFixture.ts); see
 * docs/plan-hermetic-e2e-fixtures.md.
 */
import type { Route } from '@playwright/test';

/**
 * supabase-js asks for ONE object with `.single()` / `.maybeSingle()` by
 * sending this Accept header. Answering such a request with an array hands the
 * caller `[row]` where it expects `row`, and every field read comes back
 * undefined — a failure that looks like missing data rather than a bad fixture.
 */
function wantsSingleObject(route: Route) {
  return (route.request().headers()['accept'] ?? '').includes('vnd.pgrst.object');
}

/** A HEAD count probe wants headers, not a body (LESSONS postgrest-count-column). */
export function isCountProbe(route: Route) {
  return route.request().method() === 'HEAD';
}

/** Only reads are served. A write reaching a fixture route is a test bug. */
export function isRead(route: Route) {
  const method = route.request().method();
  return method === 'GET' || method === 'HEAD';
}

export async function fulfillRows(route: Route, rows: unknown[]) {
  if (wantsSingleObject(route)) {
    if (rows.length === 0) {
      // PostgREST's own answer to `.single()` on zero rows; `.maybeSingle()`
      // turns it into `data: null`.
      await route.fulfill({
        status: 406,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST116', message: 'no rows', details: null, hint: null }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/vnd.pgrst.object+json',
      body: JSON.stringify(rows[0]),
    });
    return;
  }
  const count = rows.length;
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'content-range': `0-${Math.max(count - 1, 0)}/${count}` },
    body: JSON.stringify(rows),
  });
}
