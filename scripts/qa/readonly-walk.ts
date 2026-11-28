/**
 * Read-only browser walk guard (MYK9-1980).
 *
 * A walk drives the real app against the SHARED Supabase project. This guard
 * sits between the browser and the backend and refuses everything that is not
 * a read, so a walk can look at any screen without changing a row.
 *
 * Default-deny: a request is sent only when a rule below says it is a read.
 * Blocking non-GET table requests is not enough. RPCs are POSTs and some
 * write: on 2026-11-12 a guard that exempted `/rpc/` let `ringside_update_entry`
 * move a seeded entry to `in-ring` when a scoresheet was opened.
 *
 * An RPC is allowed only by name, from a list of functions read and found
 * STABLE. A name that looks like a read (`get_…`) is not evidence: see the note
 * on `AUDIT_READ_ONLY_RPCS` in
 * `apps/myk9show/src/test/e2e/helpers/sharedStagingWriteGuard.ts`, which this
 * file extends. Two siblings classify requests for other purposes and should
 * change with this one: `isUnambiguousSharedStagingRestWrite` there (e2e
 * specs), and `benchmarkRequestDisposition` in
 * `apps/myk9show/src/test/performance/benchmarkNetworkPolicy.ts`.
 *
 * Websocket traffic (realtime presence and broadcast) passes through
 * unchanged: it writes no table, and is routed only so `cutOffBackend` can
 * close it.
 *
 * Use from a short `.mts` script under `.logs/walks/`, run with
 * `pnpm exec tsx .logs/walks/<name>.mts`. The extension matters: a `.ts` file
 * there is compiled as CommonJS and refuses top-level `await`.
 *
 *   const context = await browser.newContext();
 *   const log = await installReadOnlyGuard(context, { appOrigin });
 *   // optional: await answerLocally(context, ['entry_carts'], log);
 *   ... walk ...
 *   console.log(formatWalkLog(log));
 *
 * The decision is `decideRequest`, a pure function, so its verdicts are
 * replayed against known answers in `readonly-walk.test.ts`. Change a rule
 * there first.
 */
import type { BrowserContext, Route, WebSocketRoute } from '@playwright/test';
import { AUDIT_READ_ONLY_RPCS } from '../../apps/myk9show/src/test/e2e/helpers/sharedStagingWriteGuard';
import { describeSimulated, type Simulated } from './readonly-walk-local';

export { answerLocally } from './readonly-walk-answers';

export type Verdict = {
  allow: boolean;
  reason: string;
  /** Set when the request is an allowed read RPC, so the walk can list which it used. */
  rpc?: string;
};

export type GuardOptions = {
  /** Origin of the app under test, e.g. `http://localhost:5173`. Its own requests are never backend writes. */
  appOrigin: string;
  /** True for a signed-out walk: sign-in is refused too, so nothing can create a session. */
  signedOut?: boolean;
  /**
   * Extra RPC names for one walk. Add a name only after reading its latest
   * `CREATE OR REPLACE FUNCTION` and finding it STABLE or IMMUTABLE. A name
   * needed by more than one walk belongs in `WALK_READ_ONLY_RPCS`.
   */
  readRpcs?: readonly string[];
};

export type WalkLog = {
  refused: string[];
  readRpcs: Set<string>;
  /** Writes `answerLocally` answered in the browser, so each screen reached through one is marked. */
  simulated: Simulated[];
};

/**
 * RPCs the role walks fire that the e2e list does not carry. Each was read in
 * the migration named beside it, where its latest definition is declared
 * STABLE, and cross-checked against the live catalog (`pg_proc.provolatile`,
 * one overload each) on 2026-11-14. Adding one: same procedure as
 * `AUDIT_READ_ONLY_RPCS`.
 */
export const WALK_READ_ONLY_RPCS: ReadonlySet<string> = new Set([
  // 20261128041700_myk9_2515_admin_user_list_stable.sql (declares it STABLE; the
  // 20261104174100 definition was VOLATILE, so read this migration, not that one)
  'get_admin_user_list',
  // 20260928034700_myk9_860_get_club_officials.sql
  'get_club_officials',
  // 20260722120000_onboarding_notes_owner_isolation.sql
  'get_my_onboarding_requests',
  // 20260929133147_secretary_live_entry_count.sql
  'get_secretary_live_entry_count',
  // 20261022035300_myk9_1311_show_entry_counts.sql
  'get_show_entry_counts',
  // 20261004181900_myk9_1008_show_requires_club.sql
  'get_show_officials',
  // 20261027213700_myk9_1450_batched_show_enrichment_rpcs.sql
  'get_shows_class_hide_counts',
  // 20261027213700_myk9_1450_batched_show_enrichment_rpcs.sql
  'get_shows_judges',
  // 20260913131500_harden_public_entry_metadata.sql
  'tv_class_entry_counts',
]);

const BACKEND_PREFIXES = [
  '/rest/v1',
  '/auth/v1',
  '/functions/v1',
  '/storage/v1',
  '/graphql/v1',
  '/realtime/v1',
] as const;

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const AUTH_READS = new Set(['/auth/v1/user', '/auth/v1/settings', '/auth/v1/health']);
const STORAGE_READ = /^\/storage\/v1\/object\/(list|sign)\//;
const RPC_PATH = /^\/rest\/v1\/rpc\/([A-Za-z0-9_]+)$/;

const allow = (reason: string): Verdict => ({ allow: true, reason });
const refuse = (reason: string): Verdict => ({ allow: false, reason });

export function isBackendPath(pathname: string): boolean {
  return BACKEND_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isReadRpcName(name: string, extra: readonly string[] = []): boolean {
  return AUDIT_READ_ONLY_RPCS.has(name) || WALK_READ_ONLY_RPCS.has(name) || extra.includes(name);
}

/** Decide one request. Pure: same inputs, same verdict. */
export function decideRequest(method: string, url: string, options: GuardOptions): Verdict {
  const verb = method.toUpperCase();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return refuse('unparseable url');
  }
  const { pathname } = parsed;

  if (!isBackendPath(pathname)) {
    if (SAFE_METHODS.has(verb)) return allow('not a backend request');
    if (parsed.origin === options.appOrigin) {
      // `/api` is a server: a Vercel function in a deploy, a proxy or a file-writing plugin in dev.
      return pathname === '/api' || pathname.startsWith('/api/')
        ? refuse('app server api')
        : allow('the app itself');
    }
    return refuse('write to a third party');
  }

  if (pathname.startsWith('/functions/v1')) {
    // An edge function can act on any method, and several send email or move money.
    return verb === 'OPTIONS' ? allow('preflight') : refuse('edge function');
  }

  if (pathname.startsWith('/auth/v1')) {
    if (verb === 'OPTIONS') return allow('preflight');
    if (verb === 'GET' && AUTH_READS.has(pathname)) return allow('auth read');
    if (verb === 'POST' && pathname === '/auth/v1/token') {
      return options.signedOut
        ? refuse('sign-in on a signed-out walk')
        : allow('sign-in or refresh');
    }
    // sign-up, recover, otp, resend, invite, verify, logout, user update: each writes or emails.
    return refuse('auth write');
  }

  const rpc = RPC_PATH.exec(pathname)?.[1];
  if (rpc !== undefined) {
    if (verb === 'OPTIONS') return allow('preflight');
    // PostgREST runs a GET or HEAD call in a read-only transaction.
    if (verb === 'GET' || verb === 'HEAD') return allow('rpc in a read-only transaction');
    if (verb === 'POST' && isReadRpcName(rpc, options.readRpcs))
      return { ...allow('read rpc'), rpc };
    return refuse('rpc not on the read-only list');
  }

  if (pathname.startsWith('/storage/v1')) {
    if (SAFE_METHODS.has(verb)) return allow('storage read');
    if (verb === 'POST' && STORAGE_READ.test(pathname)) return allow('storage list or signed url');
    return refuse('storage write');
  }

  if (SAFE_METHODS.has(verb)) return allow('read');
  return refuse('write');
}

const pathOf = (url: string): string => new URL(url).pathname;

const REALTIME = /\/realtime\/v1\//;

/** Open realtime sockets per guarded context, so `cutOffBackend` can close them. */
const socketsOf = new WeakMap<BrowserContext, Set<() => Promise<void>>>();

/** Refuse every write from this context. Call before the first page is opened. */
export async function installReadOnlyGuard(
  context: BrowserContext,
  options: GuardOptions
): Promise<WalkLog> {
  const log: WalkLog = {
    refused: [],
    readRpcs: new Set(),
    simulated: [],
  };
  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    const verdict = decideRequest(request.method(), request.url(), options);
    if (!verdict.allow) {
      log.refused.push(`${request.method()} ${pathOf(request.url())} (${verdict.reason})`);
      await route.abort();
      return;
    }
    if (verdict.rpc) log.readRpcs.add(verdict.rpc);
    await route.fallback();
  });
  // Realtime passes through unchanged; it is routed only so it can be closed later.
  const sockets = new Set<() => Promise<void>>();
  socketsOf.set(context, sockets);
  await context.routeWebSocket(REALTIME, (socket: WebSocketRoute) => {
    const server = socket.connectToServer();
    const close = async () => {
      sockets.delete(close);
      await server.close();
      await socket.close();
    };
    sockets.add(close);
    socket.onClose(() => sockets.delete(close));
  });
  return log;
}

/**
 * Cut the browser off from the backend, for a walk that opens a ringside
 * scoresheet or taps a score. Call before the first such tap and close the
 * context without reconnecting: an offline-first screen queues what it could
 * not send and would send it on reconnect.
 *
 * Every backend request is aborted, open realtime sockets are closed and new
 * ones refused, and every page (now and later) reads `navigator.onLine` as
 * false and hears an `offline` event, as a phone that lost signal would.
 */
export async function cutOffBackend(context: BrowserContext, log: WalkLog): Promise<void> {
  await context.route('**/*', async (route: Route) => {
    const request = route.request();
    const pathname = pathOf(request.url());
    if (isBackendPath(pathname)) {
      log.refused.push(`${request.method()} ${pathname} (cut off)`);
      await route.abort();
      return;
    }
    await route.fallback();
  });
  await context.routeWebSocket(REALTIME, async (socket: WebSocketRoute) => {
    log.refused.push(`WS ${pathOf(socket.url())} (cut off)`);
    await socket.close({ code: 1006, reason: 'cut off' });
  });
  await Promise.all([...(socketsOf.get(context) ?? [])].map(close => close()));

  // A string, not a function: tsx wraps named functions in `__name(...)`, which
  // does not exist in the page.
  const goOffline =
    "Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false });" +
    "window.dispatchEvent(new Event('offline'));";
  await context.addInitScript({ content: goOffline });
  await Promise.all(context.pages().map(page => page.evaluate(goOffline)));
}

export function formatWalkLog(log: WalkLog): string {
  const refused = [...new Set(log.refused)];
  return [
    `refused ${log.refused.length} request(s), ${refused.length} distinct:`,
    ...refused.map(line => `  ${line}`),
    `read RPCs allowed: ${[...log.readRpcs].sort().join(', ') || 'none'}`,
    ...formatSimulated(log.simulated),
  ].join('\n');
}

/**
 * The Simulated list: every write answered in the browser and never sent. A
 * finding on a screen listed here describes a simulated state, not the real one.
 */
function formatSimulated(simulated: readonly Simulated[]): string[] {
  const lines = [...new Set(simulated.map(describeSimulated))];
  return [
    `Simulated (answered in the browser, never sent): ${simulated.length}`,
    ...(lines.length
      ? ['  Screens reached through these are simulated; mark their findings so.']
      : []),
    ...lines.map(line => `  ${line}`),
  ];
}
