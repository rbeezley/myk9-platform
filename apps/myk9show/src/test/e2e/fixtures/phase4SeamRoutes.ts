/**
 * Phase 4 cross-role seam route interceptors (write-safe) — dispatcher + wiring.
 *
 * Routes each request to a per-seam handler (`phase4SeamHandlers.ts`) over the
 * shared HTTP layer (`phase4SeamHttp.ts`), captures every fixture-related write
 * in memory so NOTHING reaches the shared Supabase project, and exposes the
 * write-safety assertions. The pure dispatcher (`handleSeamRequest`) is split
 * from the Playwright wiring (`installPhase4SeamRoutes`) so the state machine
 * and the safety guarantees are fully unit-testable without a browser.
 *
 * Only `import type` is taken from `@playwright/test`, so this module also loads
 * cleanly under vitest (the type import is erased at transform time).
 *
 * See `phase4SeamHandlers.ts` for the per-seam DATA PATH INVENTORY.
 */

import type { Page, Route } from '@playwright/test';
import type { Phase4SeamState } from './phase4SeamFixture';
import {
  classifyUrl,
  clock,
  CONTINUE,
  error,
  FIXTURE_FUNCTIONS,
  FIXTURE_TABLES,
  WRITE_METHODS,
  type AuditEntry,
  type HandleOptions,
  type SeamName,
  type SeamRequest,
  type SeamResponse,
} from './phase4SeamHttp';
import {
  handleFixtureRead,
  handleFixtureRpc,
  handleFixtureWrite,
  handleRefundFunction,
} from './phase4SeamHandlers';

// Re-export the public surface so tests/specs import from one entry point.
export {
  classifyUrl,
  extractEqFilter,
  type AuditEntry,
  type HandleOptions,
  type SeamName,
  type SeamRequest,
  type SeamResponse,
} from './phase4SeamHttp';

/**
 * Pure request handler. Mutates `state` in place for fixture writes and returns
 * the response the interceptor should send plus an audit record. GET requests
 * for fixture-owned reads are served from state; everything else continues.
 */
export function handleSeamRequest(
  state: Phase4SeamState,
  req: SeamRequest,
  options?: HandleOptions
): { response: SeamResponse; audit: AuditEntry } {
  const start = clock(options).getTime();
  const { kind, name } = classifyUrl(req.url);
  const isWrite = WRITE_METHODS.has(req.method.toUpperCase());

  // Auth/session traffic always passes through untouched.
  if (kind === 'auth') {
    return record(req, name, CONTINUE, null, false, false, start, options);
  }

  const isFixtureFn = kind === 'function' && name !== null && FIXTURE_FUNCTIONS.has(name);
  const isFixtureTable = kind === 'rest' && name !== null && FIXTURE_TABLES.has(name);
  const isFixtureRpc = kind === 'rpc' && name === 'promote_waitlist_entry';

  // --- WRITES -------------------------------------------------------------
  if (isWrite || isFixtureFn) {
    if (isFixtureFn) {
      const resp = handleRefundFunction(state, req, options);
      return record(req, name, resp.response, resp.seam, true, false, start, options);
    }
    if (isFixtureRpc) {
      const resp = handleFixtureRpc(state, name as string, req, options);
      return record(req, name, resp.response, resp.seam, true, false, start, options);
    }
    if (isFixtureTable) {
      const resp = handleFixtureWrite(state, name as string, req, options);
      return record(req, name, resp.response, resp.seam, true, false, start, options);
    }
    // A non-auth, non-fixture app-data mutation. NEVER pass it through — that
    // would risk a shared-Supabase write. Block with 500 and flag it so
    // assertNoUnhandledAppDataMutations fails the test loudly.
    const allowed = (options?.allowWritePaths ?? []).some(re => re.test(req.url));
    if (allowed) {
      return record(req, name, CONTINUE, null, false, false, start, options);
    }
    return record(
      req,
      name,
      error(500, `Blocked unhandled app-data mutation: ${req.method} ${req.url}`),
      null,
      false,
      true,
      start,
      options
    );
  }

  // --- READS --------------------------------------------------------------
  if (isFixtureTable) {
    const resp = handleFixtureRead(state, name as string, req);
    if (resp) {
      return record(req, name, resp.response, resp.seam, false, false, start, options);
    }
  }
  return record(req, name, CONTINUE, null, false, false, start, options);
}

function record(
  req: SeamRequest,
  table: string | null,
  response: SeamResponse,
  seam: SeamName | null,
  isFixtureWrite: boolean,
  isUnhandledMutation: boolean,
  start: number,
  options?: HandleOptions
): { response: SeamResponse; audit: AuditEntry } {
  const elapsedMs = Math.max(0, clock(options).getTime() - start);
  return {
    response,
    audit: {
      method: req.method.toUpperCase(),
      url: req.url,
      table,
      payload: req.postData ?? null,
      fulfilled: response.action === 'fulfill',
      status: response.status,
      seam,
      isFixtureWrite,
      isUnhandledMutation,
      elapsedMs,
    },
  };
}

// --- Assertions -----------------------------------------------------------

/**
 * Fails if any fixture write was continued to the network instead of being
 * fulfilled locally — the core shared-Supabase safety guarantee.
 */
export function assertNoSharedWrites(audit: AuditEntry[]): void {
  const leaked = audit.filter(a => a.isFixtureWrite && !a.fulfilled);
  if (leaked.length > 0) {
    const detail = leaked.map(a => `${a.method} ${a.url}`).join('\n  ');
    throw new Error(
      `assertNoSharedWrites: ${leaked.length} fixture write(s) reached the network:\n  ${detail}`
    );
  }
}

/**
 * Fails if any non-auth app-data mutation was neither fulfilled locally nor
 * explicitly allowed — catches a seam touching an endpoint we did not model.
 */
export function assertNoUnhandledAppDataMutations(audit: AuditEntry[]): void {
  const unhandled = audit.filter(a => a.isUnhandledMutation);
  if (unhandled.length > 0) {
    const detail = unhandled.map(a => `${a.method} ${a.url}`).join('\n  ');
    throw new Error(
      `assertNoUnhandledAppDataMutations: ${unhandled.length} unmodeled mutation(s):\n  ${detail}`
    );
  }
}

// --- Playwright wiring ----------------------------------------------------

export interface InstalledSeamRoutes {
  /** Chronological audit of every intercepted request. */
  audit: AuditEntry[];
  /** Convenience: throws if any fixture write leaked to the network. */
  assertSafe: () => void;
}

/**
 * Install the seam interceptors on a Playwright page. Both browser contexts in
 * a two-context spec must share the SAME `state` instance so the secretary and
 * exhibitor observe the same in-memory show.
 */
export async function installPhase4SeamRoutes(
  page: Page,
  state: Phase4SeamState,
  options?: HandleOptions
): Promise<InstalledSeamRoutes> {
  const audit: AuditEntry[] = [];

  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    let postData: unknown = null;
    try {
      postData = request.postDataJSON();
    } catch {
      postData = request.postData() ?? null;
    }
    const headers = lowercaseHeaders(request.headers());
    const { response, audit: entry } = handleSeamRequest(
      state,
      { method: request.method(), url: request.url(), postData, headers },
      options
    );
    audit.push(entry);
    if (response.action === 'continue') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: response.status,
      contentType: response.contentType,
      body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
    });
  };

  await page.route('**/rest/v1/**', handler);
  await page.route('**/functions/v1/**', handler);

  return {
    audit,
    assertSafe: () => {
      assertNoSharedWrites(audit);
      assertNoUnhandledAppDataMutations(audit);
    },
  };
}

function lowercaseHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}
