import { expect, test } from '@playwright/test';
import type { APIResponse, Page, Response } from '@playwright/test';

/**
 * Shared plumbing for the LIVE-data canaries: `exhibitorReadPathCanary` and
 * `walkRegressionCanaries` (MYK9-702, MYK9-730).
 *
 * A canary talks to whatever database the run targets, with no fixture, and
 * has to tell two situations apart:
 *
 * - DATA ABSENT: the target holds no row the canary can check. An operational
 *   condition, not a verdict on the diff, so it SKIPS with a
 *   `staging-data-absent` annotation. Where the target is a seeded database
 *   (`MYK9_PLAYWRIGHT_REGRESSION_ENABLED=true`), absence FAILS instead.
 * - BROKEN: a read answers 4xx/5xx or malformed JSON, or the data is there and
 *   the page states something else. That fails.
 */

export const DATA_REQUIRED = process.env.MYK9_PLAYWRIGHT_REGRESSION_ENABLED === 'true';

/**
 * THE one place a live read is judged. Absence is a positive finding: a read
 * counts as "no data" ONLY when it succeeded AND parsed to a well-formed
 * result with zero rows. Every other outcome — an error status, unparseable
 * JSON, a payload of the wrong shape — is breakage.
 *
 * Two Codex rounds on #2392 each found a different path where something that
 * was not a successful empty read still defaulted to zero and skipped as
 * data-absent (a read never issued; malformed JSON). Both came from judging
 * reads in more than one place with "0" as the fallback. There is no fallback
 * here: a read that is not provably empty is not empty.
 */
export type ReadOutcome<T = unknown> =
  { ok: true; rows: number; data: T[] } | { ok: false; reason: string };

export async function judgeRead<T = unknown>(
  response: Response | APIResponse
): Promise<ReadOutcome<T>> {
  if (response.status() >= 400) return { ok: false, reason: `HTTP ${response.status()}` };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: `HTTP ${response.status()} with unparseable JSON` };
  }
  if (Array.isArray(body)) return { ok: true, rows: body.length, data: body as T[] };
  // `.single()` / `.maybeSingle()` reads answer with one object.
  if (body !== null && typeof body === 'object') return { ok: true, rows: 1, data: [body as T] };
  return { ok: false, reason: `unexpected payload: ${JSON.stringify(body).slice(0, 60)}` };
}

/** Skip (PR smoke, shared staging) or fail (seeded nightly) on missing data. */
export function dataAbsent(what: string): never {
  const note =
    `staging data is missing (${what}); this canary was NOT exercised. ` +
    'This is not a verdict on the diff. Reseed staging (seed-reset skill) to restore coverage.';
  if (DATA_REQUIRED) throw new Error(`nightly: ${note}`);
  test.info().annotations.push({ type: 'staging-data-absent', description: note });
  test.skip(true, note);
  // test.skip throws; this line only satisfies the `never` return type.
  throw new Error(note);
}

export interface RestAuth {
  origin: string;
  apikey: string;
  bearer: string;
}

/**
 * The target's REST origin and the signed-in user's credentials, taken from the
 * app's OWN authenticated request rather than from env. The same spec then
 * reads shared staging in Nightly Health and the disposable seeded database in
 * Playwright Regression, and can never read one while the page renders the
 * other. Call before signing in; await `get()` after.
 *
 * The bearer must differ from the apikey: before sign-in supabase-js sends the
 * anon key as the bearer, and a ground-truth read made as anon would be judged
 * against rows the signed-in user may not share.
 */
export function captureRestAuth(page: Page) {
  let auth: RestAuth | undefined;
  page.on('request', request => {
    if (auth) return;
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/rest/v1/')) return;
    const headers = request.headers();
    const apikey = headers['apikey'];
    const bearer = headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (!apikey || !bearer || bearer === apikey) return;
    auth = { origin: url.origin, apikey, bearer };
  });
  return {
    async get(): Promise<RestAuth> {
      await expect
        .poll(() => auth !== undefined, {
          timeout: 20000,
          message: 'the app never made an authenticated REST request after sign-in',
        })
        .toBe(true);
      return auth!;
    },
  };
}

/**
 * A ground-truth read made as the signed-in user, independent of the app's own
 * derivation. `path` is everything after `/rest/v1/`. An RPC passes `body` and
 * is POSTed (PostgREST's only way to call a function with arguments); every
 * RPC a canary calls must be a read.
 */
export async function liveRead<T = unknown>(
  page: Page,
  auth: RestAuth,
  path: string,
  body?: Record<string, unknown>
): Promise<ReadOutcome<T>> {
  const url = `${auth.origin}/rest/v1/${path}`;
  const headers = {
    apikey: auth.apikey,
    Authorization: `Bearer ${auth.bearer}`,
    'Content-Type': 'application/json',
  };
  const response = body
    ? await page.request.post(url, { headers, data: body })
    : await page.request.get(url, { headers });
  return judgeRead<T>(response);
}

/** A ground-truth read that must succeed: a failed one IS a regression. */
export async function requireRead<T = unknown>(
  page: Page,
  auth: RestAuth,
  path: string,
  body?: Record<string, unknown>
): Promise<T[]> {
  const outcome = await liveRead<T>(page, auth, path, body);
  if (!outcome.ok) {
    throw new Error(
      `live read ${path.split('?')[0]} failed (${outcome.reason}). This IS a regression`
    );
  }
  return outcome.data;
}
