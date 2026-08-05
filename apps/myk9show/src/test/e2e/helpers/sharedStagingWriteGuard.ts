import type { Page, Route } from '@playwright/test';

export const SHARED_STAGING_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';

type GuardedWriteKind = 'ringside-update-entry-rpc' | 'entries-patch';

/**
 * How a shared-staging write was disposed of.
 *
 * `intercepted` — a write this guard knows how to answer locally; the request
 * never left the machine. `blocked` — an *unrecognised* REST write that the
 * catch-all aborted. A blocked entry is the interesting one: it means a code
 * path started writing to shared staging that no guard rule anticipated, and
 * the audit's "no shared-staging writes" claim would have been false without
 * the abort.
 */
export type SharedStagingWriteDisposition = 'intercepted' | 'blocked';

export interface SharedStagingWriteLedgerEntry {
  kind: GuardedWriteKind | 'unclassified-rest-write';
  method: string;
  /** Path only — query strings can carry row ids and filter values. */
  path: string;
  disposition: SharedStagingWriteDisposition;
}

interface RequestLike {
  method: string;
  url: string;
}

interface GuardedWrite {
  kind: GuardedWriteKind;
}

export interface GuardedRingsideRpcCall {
  p_entry_id?: string;
  p_fields?: Record<string, unknown>;
  /** OCC token the write carried, so a spec can assert token advancement. */
  p_expected_version?: number;
}

interface SharedStagingWriteGuardOptions {
  ringsideRpcCalls?: GuardedRingsideRpcCall[];
  versionBase?: number;
  observeIsolatedRingsideWrites?: boolean;
  /**
   * Append-only record of every shared-staging write this guard saw. Pass an
   * array to collect the audit's escape proof (MYK9-144 AC6); omit it and the
   * guard behaves exactly as before.
   */
  ledger?: SharedStagingWriteLedgerEntry[];
  /**
   * Reject this many matching `ringside_update_entry` calls with the RPC's real
   * optimistic-concurrency error before answering normally. Lets a browser spec
   * exercise the conflict path that a plain interception cannot reach, because
   * an intercepted call otherwise always succeeds.
   */
  conflictResponses?: number;
  /**
   * Which calls `conflictResponses` applies to. Defaults to every call, which is
   * rarely what a spec wants: scoring ONE dog emits three ringside writes
   * (check-in `in-ring`, the score, check-out `completed`), so a count alone
   * lands on the check-in and silently proves nothing about scoring. Match on
   * the payload instead.
   */
  conflictMatcher?: (call: GuardedRingsideRpcCall) => boolean;
  /**
   * Authoritative server version carried in the conflict's `details`, mirroring
   * how `ringside_update_entry` raises its 40001 (see
   * packages/replication/src/mutation-occ.ts `getConflictServerVersion`).
   */
  conflictServerVersion?: number;
}

export function classifySharedStagingWrite(request: RequestLike): GuardedWrite | null {
  const url = parseUrl(request.url);
  if (!url || !isSharedStagingHost(url.hostname)) {
    return null;
  }

  const method = request.method.toUpperCase();
  if (method === 'POST' && url.pathname === '/rest/v1/rpc/ringside_update_entry') {
    return { kind: 'ringside-update-entry-rpc' };
  }

  if (method === 'PATCH' && url.pathname === '/rest/v1/entries') {
    return { kind: 'entries-patch' };
  }

  return null;
}

/**
 * True for a REST request to shared staging that is unambiguously a write.
 *
 * PATCH/PUT/DELETE on any `/rest/v1/*` path, and POST to a *table* path, can
 * only mutate. `POST /rest/v1/rpc/*` is deliberately excluded: a large share of
 * this app's RPCs are read-only (`is_show_manager`, count helpers), so aborting
 * them by method alone would break the very journeys the audit is replaying.
 */
export function isUnambiguousSharedStagingRestWrite(request: RequestLike): boolean {
  const url = parseUrl(request.url);
  if (!url || !isSharedStagingHost(url.hostname)) return false;
  if (!url.pathname.startsWith('/rest/v1/')) return false;

  const method = request.method.toUpperCase();
  if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') return true;
  return method === 'POST' && !url.pathname.startsWith('/rest/v1/rpc/');
}

/** Every write reached a local answer — nothing was forwarded to shared staging. */
export function summarizeSharedStagingWriteLedger(ledger: SharedStagingWriteLedgerEntry[]) {
  return {
    total: ledger.length,
    intercepted: ledger.filter(entry => entry.disposition === 'intercepted').length,
    blocked: ledger.filter(entry => entry.disposition === 'blocked'),
  };
}

export async function installSharedStagingWriteGuard(
  page: Page,
  options: SharedStagingWriteGuardOptions = {}
) {
  const ringsideRpcCalls = options.ringsideRpcCalls ?? [];
  const versionBase = options.versionBase ?? 100;
  const observeIsolatedRingsideWrites = options.observeIsolatedRingsideWrites ?? false;
  const ledger = options.ledger;
  const conflictServerVersion = options.conflictServerVersion ?? versionBase + 1;
  const conflictMatcher = options.conflictMatcher ?? (() => true);
  let remainingConflictResponses = options.conflictResponses ?? 0;

  // Registered FIRST on purpose. Playwright matches routes in reverse
  // registration order, so the two specific handlers below take precedence and
  // this only ever sees writes no rule anticipated.
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const requestLike = { method: request.method(), url: request.url() };

    if (!isUnambiguousSharedStagingRestWrite(requestLike)) {
      await fallbackRoute(route);
      return;
    }

    recordLedgerEntry(ledger, requestLike, 'unclassified-rest-write', 'blocked');
    await route.abort('blockedbyclient');
  });

  await page.route('**/rest/v1/rpc/ringside_update_entry', async route => {
    const request = route.request();
    const requestLike = {
      method: request.method(),
      url: request.url(),
    };
    const guardedWrite = classifySharedStagingWrite(requestLike);

    const isSharedStagingWrite = guardedWrite?.kind === 'ringside-update-entry-rpc';
    const isObservedIsolatedWrite =
      observeIsolatedRingsideWrites &&
      isRingsideUpdateEntryRequest(requestLike) &&
      isIsolatedHost(requestLike.url);

    if (!isSharedStagingWrite && !isObservedIsolatedWrite) {
      await fallbackRoute(route);
      return;
    }

    const payload = (request.postDataJSON() ?? {}) as GuardedRingsideRpcCall;
    ringsideRpcCalls.push(payload);

    if (isObservedIsolatedWrite) {
      await fallbackRoute(route);
      return;
    }

    recordLedgerEntry(ledger, requestLike, 'ringside-update-entry-rpc', 'intercepted');

    if (remainingConflictResponses > 0 && conflictMatcher(payload)) {
      remainingConflictResponses -= 1;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        // The client classifies this by the body's `code`, not the HTTP status
        // (`isVersionConflictError` in packages/replication/src/mutation-occ.ts),
        // and reads the authoritative version out of `details`.
        body: JSON.stringify({
          code: '40001',
          details: String(conflictServerVersion),
          hint: null,
          message: 'version conflict',
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(versionBase + ringsideRpcCalls.length),
    });
  });

  await page.route('**/rest/v1/entries**', async route => {
    const request = route.request();
    const requestLike = {
      method: request.method(),
      url: request.url(),
    };
    const guardedWrite = classifySharedStagingWrite(requestLike);

    if (guardedWrite?.kind !== 'entries-patch') {
      if (isUnambiguousSharedStagingRestWrite(requestLike)) {
        recordLedgerEntry(ledger, requestLike, 'unclassified-rest-write', 'blocked');
        await route.abort('blockedbyclient');
        return;
      }
      await fallbackRoute(route);
      return;
    }

    recordLedgerEntry(ledger, requestLike, 'entries-patch', 'intercepted');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });
}

function recordLedgerEntry(
  ledger: SharedStagingWriteLedgerEntry[] | undefined,
  request: RequestLike,
  kind: SharedStagingWriteLedgerEntry['kind'],
  disposition: SharedStagingWriteDisposition
) {
  if (!ledger) return;
  ledger.push({
    kind,
    method: request.method.toUpperCase(),
    path: parseUrl(request.url)?.pathname ?? request.url,
    disposition,
  });
}

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isSharedStagingHost(hostname: string) {
  return hostname === `${SHARED_STAGING_PROJECT_REF}.supabase.co`;
}

function isRingsideUpdateEntryRequest(request: RequestLike) {
  const url = parseUrl(request.url);
  return (
    request.method.toUpperCase() === 'POST' &&
    url?.pathname === '/rest/v1/rpc/ringside_update_entry'
  );
}

function isIsolatedHost(value: string) {
  const url = parseUrl(value);
  return url?.hostname === '127.0.0.1' || url?.hostname === 'localhost';
}

async function fallbackRoute(route: Route) {
  await route.fallback();
}
