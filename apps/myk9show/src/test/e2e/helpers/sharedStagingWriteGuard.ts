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
  kind: GuardedWriteKind | 'presence-rpc' | 'unclassified-rest-write';
  method: string;
  /** Path only — query strings can carry row ids and filter values. */
  path: string;
  disposition: SharedStagingWriteDisposition;
}

export interface RequestLike {
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
  /**
   * Block any RPC POST outside {@link AUDIT_READ_ONLY_RPCS}. Required for a run
   * that claims shared staging received no writes; see the constant's note on
   * why this is an allowlist.
   */
  strictRpcWrites?: boolean;
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
 * RPCs the guard will let reach shared staging, because they only read.
 *
 * Measured, not guessed: these are exactly the RPCs the judge replay fires
 * (`get_show_class_hide_counts`, `get_account_today_entries`,
 * `get_user_permissions`, `get_user_roles`, `get_effective_permissions`,
 * `get_own_entitlement_context`).
 *
 * The list is an ALLOWLIST rather than a list of known-mutating RPCs, and that
 * direction is the point. `POST /rest/v1/rpc/<name>` is opaque — the app calls
 * both read helpers and genuine writers (`upsert_ringside_session`,
 * `self_checkin_entry`, `refresh_class_scoring_state_authorized`) the same way.
 * Enumerating the writers means a newly added one is forwarded to shared
 * staging in silence while the audit still reports "no writes"; enumerating the
 * readers means it is blocked and the run fails loudly instead.
 *
 * ADDING AN ENTRY: read the LATEST `CREATE OR REPLACE FUNCTION` for it in
 * `supabase/migrations/` (LESSONS `replace-function-latest`) and confirm the
 * declaration says STABLE or IMMUTABLE — a VOLATILE function may write, and
 * Postgres treats an omitted keyword as VOLATILE. Record that migration beside
 * the name below. This is a human read on purpose: a regex over migration text
 * is not sound enough to automate (a `-- used to be STABLE` comment, a
 * commented-out or `DO $$ EXECUTE`-wrapped CREATE, a later DROP or
 * `ALTER FUNCTION ... VOLATILE`, or a STABLE overload masking a VOLATILE one
 * all read as STABLE to a scanner, and a guard that fails open is worse than
 * none — MYK9-545 round 3 deleted exactly such a test).
 *
 * All ten below were read this way: every one is declared STABLE, and no
 * migration alters or overloads it. The first nine were also cross-checked
 * against the live catalog (`pg_proc.provolatile`); `manageable_show_ids`
 * (MYK9-730) was read from its migrations only.
 */
export const AUDIT_READ_ONLY_RPCS: ReadonlySet<string> = new Set([
  // 20260905090000_exhibitor_online_payment_readiness.sql — `select exists
  // (select 1 from club_stripe_accounts ...)`. The registration wizard's payment
  // step gates the whole card option on it (`useClubStripePaymentReadiness`), so
  // blocking it did not fail loudly: the query simply never succeeded,
  // "Credit/Debit Card (Online Payment)" never rendered, and the spec read as a
  // product failure (MYK9-545).
  'can_accept_online_entry_payment',
  // 20260908134500_optimize_account_today_entry_reads.sql
  'get_account_today_entries',
  // 20260730110000_restrict_rbac_access_lookups.sql
  'get_effective_permissions',
  // 20260724120000_subscription_entitlement_grants.sql
  'get_own_entitlement_context',
  // 20260830240000_show_officials_separates_label_from_permission.sql
  'get_show_class_hide_counts',
  // 20260912211500_get_show_judges_for_public_surfaces.sql — a pure read of
  // judge_assignments. MYK9-545 round 3: the guard's new abort log printed this
  // 76 times across a single registration sweep, so every spec was driving a
  // wizard whose judge query could never succeed — invisible because no spec
  // asserts on judges.
  'get_show_judges',
  // 20260830240000_show_officials_separates_label_from_permission.sql — the
  // walk canaries' (MYK9-730) set of shows the secretary may manage.
  'manageable_show_ids',
  // 20260730110000_restrict_rbac_access_lookups.sql
  'get_user_permissions',
  // 20260730110000_restrict_rbac_access_lookups.sql
  'get_user_roles',
  // 20260710160000_ringside_passcode_generation_revocation_complete.sql —
  // RingsideSessionHeartbeat's push-independent staleness probe. It returns a
  // boolean and writes nothing. It does NOT appear in a dev-server replay —
  // `getExistingSubscription()` never settles without a registered service
  // worker, and the dev PWA is disabled — but it fires the moment the replay
  // runs against a built preview, and blocking a read would fail the audit for
  // no reason.
  'ringside_claim_generation_current',
]);

/**
 * Presence writes the guard answers locally instead of blocking.
 *
 * `RingsideSessionHeartbeat` runs on every `/at-show` route and, once a push
 * subscription exists, writes ringside session presence every 30s. These are
 * real writes and must never reach shared staging — but they are ambient
 * background traffic, not part of the journey under audit, so aborting them
 * would fail the run over something the replay never asked for. Intercepting
 * keeps shared staging clean AND keeps the evidence readable: they appear in
 * the ledger as intercepted, like any other guarded write.
 */
export const AUDIT_INTERCEPTED_WRITE_RPCS: ReadonlySet<string> = new Set([
  'upsert_ringside_session',
  'clear_ringside_session_presence',
]);

export interface SharedStagingWriteClassificationOptions {
  /**
   * Treat an RPC POST outside {@link AUDIT_READ_ONLY_RPCS} as a write. On for
   * the audit replay, whose artifact asserts nothing was forwarded; off by
   * default so existing specs, which make no such claim, are unaffected.
   */
  strictRpc?: boolean;
}

/**
 * True for a REST request to shared staging that is unambiguously a write.
 *
 * PATCH/PUT/DELETE on any `/rest/v1/*` path, and POST to a *table* path, can
 * only mutate. An RPC POST is opaque, so it counts as a write only under
 * `strictRpc` — see {@link AUDIT_READ_ONLY_RPCS}.
 */
export function isUnambiguousSharedStagingRestWrite(
  request: RequestLike,
  options: SharedStagingWriteClassificationOptions = {}
): boolean {
  const url = parseUrl(request.url);
  if (!url || !isSharedStagingHost(url.hostname)) return false;
  if (!url.pathname.startsWith('/rest/v1/')) return false;

  const method = request.method.toUpperCase();
  if (method === 'PATCH' || method === 'PUT' || method === 'DELETE') return true;
  if (method !== 'POST') return false;

  if (!url.pathname.startsWith('/rest/v1/rpc/')) return true;
  if (!options.strictRpc) return false;

  const rpcName = url.pathname.slice('/rest/v1/rpc/'.length);
  // ringside_update_entry has its own dedicated handler, which takes precedence.
  return rpcName !== 'ringside_update_entry' && !AUDIT_READ_ONLY_RPCS.has(rpcName);
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
  const ledger = options.ledger;
  const conflictServerVersion = options.conflictServerVersion ?? versionBase + 1;
  const conflictMatcher = options.conflictMatcher ?? (() => true);
  const strictRpcWrites = options.strictRpcWrites ?? false;
  let remainingConflictResponses = options.conflictResponses ?? 0;

  // Registered FIRST on purpose. Playwright matches routes in reverse
  // registration order, so the two specific handlers below take precedence and
  // this only ever sees writes no rule anticipated.
  await page.route('**/rest/v1/**', async route => {
    const request = route.request();
    const requestLike = { method: request.method(), url: request.url() };

    if (strictRpcWrites && isInterceptedWriteRpc(requestLike)) {
      recordLedgerEntry(ledger, requestLike, 'presence-rpc', 'intercepted');
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
      return;
    }

    if (!isUnambiguousSharedStagingRestWrite(requestLike, { strictRpc: strictRpcWrites })) {
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
    const isObservedIsolatedWrite = isObservableIsolatedRingsideWrite(requestLike);

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
      if (isUnambiguousSharedStagingRestWrite(requestLike, { strictRpc: strictRpcWrites })) {
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

/**
 * MYK9-545: an abort used to be silent. `recordLedgerEntry` no-ops unless the
 * caller passed a `ledger`, and no spec in the repo does, so a blocked request
 * left no trace at all — the app's query simply never resolved and the spec
 * failed somewhere else entirely, reading as a product defect. That is exactly
 * how `can_accept_online_entry_payment` (a pure read) cost a day: the card
 * payment option never rendered and nothing said why. Every abort now announces
 * itself on stdout, ledger or no ledger.
 */
function announceBlockedRequest(request: RequestLike) {
  const url = parseUrl(request.url);
  const path = url?.pathname ?? request.url;
  const rpcName = path.startsWith('/rest/v1/rpc/') ? path.slice('/rest/v1/rpc/'.length) : undefined;
  // Unconditional by design: a blocked request that says nothing is the bug
  // being fixed. PATH ONLY, never the full URL — the same rule the ledger keeps,
  // for the same reason: a query string carries row ids and filter values
  // (`PATCH /rest/v1/entries?id=eq.<uuid>`), and this line lands in Playwright
  // artifacts.
  console.warn(
    `[sharedStagingWriteGuard] BLOCKED ${request.method.toUpperCase()} ${path}` +
      (rpcName ? ` (RPC "${rpcName}" — if it only reads, add it to AUDIT_READ_ONLY_RPCS)` : '')
  );
}

function recordLedgerEntry(
  ledger: SharedStagingWriteLedgerEntry[] | undefined,
  request: RequestLike,
  kind: SharedStagingWriteLedgerEntry['kind'],
  disposition: SharedStagingWriteDisposition
) {
  if (disposition === 'blocked') announceBlockedRequest(request);
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

function isInterceptedWriteRpc(request: RequestLike) {
  const url = parseUrl(request.url);
  if (!url || !isSharedStagingHost(url.hostname)) return false;
  if (request.method.toUpperCase() !== 'POST') return false;
  if (!url.pathname.startsWith('/rest/v1/rpc/')) return false;
  return AUDIT_INTERCEPTED_WRITE_RPCS.has(url.pathname.slice('/rest/v1/rpc/'.length));
}

function isRingsideUpdateEntryRequest(request: RequestLike) {
  const url = parseUrl(request.url);
  return (
    request.method.toUpperCase() === 'POST' &&
    url?.pathname === '/rest/v1/rpc/ringside_update_entry'
  );
}

/**
 * Whether a ringside write addressed to an ISOLATED target should be recorded
 * in `ringsideRpcCalls` (and then forwarded untouched).
 *
 * This is deliberately NOT opt-in. It used to be, and the default of `false`
 * cost more than it ever saved: `classifySharedStagingWrite` only matches the
 * shared-staging host, so against the isolated Supabase target every
 * `ringside_update_entry` POST fell through unrecorded and `ringsideRpcCalls`
 * stayed empty forever. On the first run of Playwright Regression that ever
 * executed a test (2026-08-31, after #1889), five `atShowJudgeScoring` specs
 * failed with `Received: []` while the aria snapshot showed the judge's score
 * saved — and a sixth, which asserts the array stays EMPTY, passed without
 * ever having been able to fail.
 *
 * Observation now follows the host, so a spec cannot be blind to writes it is
 * asserting on by forgetting a flag. Shared-staging interception is unchanged:
 * those writes are still answered locally and never leave the machine.
 */
export function isObservableIsolatedRingsideWrite(request: RequestLike) {
  return isRingsideUpdateEntryRequest(request) && isIsolatedHost(request.url);
}

function isIsolatedHost(value: string) {
  const url = parseUrl(value);
  return url?.hostname === '127.0.0.1' || url?.hostname === 'localhost';
}

async function fallbackRoute(route: Route) {
  await route.fallback();
}
