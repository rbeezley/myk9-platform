// Every safety rule of a landing capture run, as pure functions with no imports, so each has
// known-answer tests (src/test/scripts/landingCaptureGuard.test.ts) and node can load the file
// without a build. guard.ts wires them to the browser; nothing there decides anything.
//
// The rules (MYK9-2181, owner's decision of 2026-11-18):
//   1. A capture drives a dev server on this machine and a Supabase stack on this machine
//      (pnpm qa:isolated-e2e:prepare). There is no opt-in for a hosted project.
//   2. A request to a hosted Supabase project is never sent, and it stops the run: no account
//      is signed in and no image is written after it.
//   3. Any other host off this machine is refused, except a GET for the app's web fonts.
//   4. Of the requests to the local stack, only reads leave the browser. A state the seed does
//      not hold is staged in the browser, never written.
//   5. No WebSocket is connected to any server.

/** Keep the same as PRODUCTION_PROJECT_REF in src/test/productionFixtureGuard.ts. */
const PRODUCTION_PROJECT_REF = 'sojmvhhwsjxmfistvzbe';

/** The only hosts off this machine a capture may read from: the fonts index.html links. */
export const FONT_HOSTS: readonly string[] = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const HOSTED_DOMAINS = ['supabase.co', 'supabase.in', 'supabase.net', 'supabase.com'];
const isWeb = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:';
/** Lower case, and without the trailing dot a fully qualified name may carry. */
const bareHost = (hostname: string) => hostname.toLowerCase().replace(/\.+$/, '');

/** True when a host is this machine. `hostname` is what `new URL(...).hostname` returns. */
export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/** True when a host is the production Supabase project, on any of its subdomains. */
export function isProductionHost(hostname: string): boolean {
  return bareHost(hostname).split('.').includes(PRODUCTION_PROJECT_REF);
}

/** True when a host is a hosted Supabase project: production, or any other one. */
export function isHostedBackendHost(hostname: string): boolean {
  const host = bareHost(hostname);
  return isProductionHost(host) || HOSTED_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
}

/**
 * Throws unless the backend the app is built against is on this machine. `origin` is the
 * app's own statement of it (the `myk9-supabase-origin` meta in index.html, filled from
 * VITE_SUPABASE_URL): a missing or unreadable one fails, so "the page made no request yet"
 * is never taken as proof.
 */
export function assertLocalBackend(origin: string | null | undefined): void {
  let url: URL | undefined;
  try {
    url = origin ? new URL(origin) : undefined;
  } catch {
    url = undefined;
  }
  if (!url || !isWeb(url) || !isLoopbackHost(url.hostname)) {
    throw new Error(stopMessage(`the backend "${origin ?? 'not stated by the page'}"`));
  }
}

export type SecretDeps = {
  /** Throws when the run has been stopped (guard.assertIsolated). */
  assertIsolated(): void;
  /** The backend origin the page states, or null. */
  backendOrigin(): Promise<string | null>;
  /** Types the password and submits it. */
  type(): Promise<void>;
};

/**
 * The only way a capture types a password: after the page has said its backend is on this
 * machine and with no request to a hosted project so far. The sign-in request it then makes
 * still goes through decideRequest.
 */
export async function typeSecretChecked(deps: SecretDeps): Promise<void> {
  deps.assertIsolated();
  assertLocalBackend(await deps.backendOrigin());
  deps.assertIsolated();
  await deps.type();
}

/**
 * The origin of the dev server a capture drives. Throws unless it is plain http(s) on this
 * machine, so a capture can never be pointed at a deployed site.
 */
export function devServerOrigin(base: string): string {
  const url = new URL(base);
  if (!isWeb(url) || !isLoopbackHost(url.hostname)) {
    throw new Error(`Capture runs drive a local dev server only; CAPTURE_BASE_URL is ${base}`);
  }
  return url.origin;
}

/**
 * Chromium's --host-resolver-rules value: no name resolves but this machine and the font
 * hosts. A second lock under the request guard, and it also covers what a route cannot see
 * (index.html's preconnect to the production project, a service worker, a WebSocket).
 */
export function hostResolverRules(): string {
  const open = [...LOOPBACK_HOSTS, ...FONT_HOSTS];
  return ['MAP * ~NOTFOUND', ...open.map(host => `EXCLUDE ${host}`)].join(', ');
}

/**
 * The arguments every capture browser is launched with: the resolver lock, and no proxy,
 * because a proxy would resolve names itself and so step around the lock. selfcheck.ts
 * proves the lock in a real browser.
 */
export function launchArgs(): string[] {
  return [`--host-resolver-rules=${hostResolverRules()}`, '--no-proxy-server'];
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** RPC names that read, by prefix. A name alone proves nothing: see NOT_READ_RPC_NAMES. */
export const READ_RPC_PREFIX = /^(get_|is_|list_|has_|can_|tv_|find_)/;
/** Reads whose names do not say so. */
export const READ_RPC_NAMES: ReadonlySet<string> = new Set([
  'entry_results_changed_since',
  'ringside_claim_generation_current',
]);
/**
 * RPCs with a read prefix that the database does not declare STABLE or IMMUTABLE, so they
 * may write (`get_show_access_codes` syncs judge passcodes). Refused like any other write.
 * landingCaptureGuardRpc.test.ts reads supabase/migrations and fails unless this list is
 * exactly those functions, and unless every name that passes is declared read-only there,
 * which Postgres enforces: a STABLE function cannot change data.
 */
export const NOT_READ_RPC_NAMES: ReadonlySet<string> = new Set([
  'get_admin_user_list',
  'get_judge_day_capacity',
  'get_judge_day_capacity_live',
  'get_show_access_codes',
  'get_show_email_content',
  'get_show_email_delivery_history',
  'list_retryable_waitlist_notification_events',
]);

/** Whether an RPC is a read: named as one, and not on the list of those that may write. */
export function isReadRpc(name: string): boolean {
  if (NOT_READ_RPC_NAMES.has(name)) return false;
  return READ_RPC_PREFIX.test(name) || READ_RPC_NAMES.has(name);
}

/** The RPC a PostgREST path calls, if it calls one. */
export function rpcName(pathname: string): string | undefined {
  return pathname.match(/\/rest\/v1\/rpc\/([^/?]+)/)?.[1];
}

function isReadMethod(method: string): boolean {
  return READ_METHODS.has(method);
}

/**
 * Whether a request to the local stack may leave the browser. GET/HEAD/OPTIONS read. Of the
 * POSTs, only the token endpoint (sign-in and refresh) and RPCs with a read name pass: RPCs
 * are POSTs and some write, so "/rpc/" is never let through as a whole, and neither is the
 * rest of "/auth/v1/" (sign-out, sign-up and recovery all change something).
 */
export function isReadRequest(method: string, pathname: string): boolean {
  if (isReadMethod(method)) return true;
  if (method !== 'POST') return false;
  if (pathname === '/auth/v1/token') return true;
  const rpc = rpcName(pathname);
  return rpc !== undefined && isReadRpc(rpc);
}

type RequestDecision =
  /** The dev server's own page, scripts and assets: untouched. */
  | 'dev-server'
  /** A hosted Supabase project: not sent, and the run stops. */
  | 'stop-run'
  /** A host off this machine that is not a font read: not sent. */
  | 'block'
  /** A staged write RPC: answered in the browser, not sent. */
  | 'answer'
  /** The run has cut the browser off: not sent. */
  | 'offline'
  /** A write to the local stack: not sent. */
  | 'refuse-write'
  /** A read whose rows the run rewrites before the app sees them. */
  | 'patch'
  /** A read: sent as it is. */
  | 'pass';

export type RequestFacts = {
  method: string;
  url: string;
  /** From devServerOrigin(). Only this exact origin is the dev server. */
  devOrigin: string;
  /** True while the run plays "no signal". */
  cutOff: boolean;
  /** Names of the write RPCs the run answers in the browser. */
  stagedRpcs: Pick<ReadonlySet<string>, 'has'>;
  /** Paths under /rest/v1/ whose rows the run rewrites. */
  patchPaths?: RegExp | undefined;
};

/**
 * What happens to one request. The order is the rule: the hosted-backend check comes before
 * everything that could let a request through, and the dev server is exempt by exact origin
 * only, so a Supabase stack on another port of the same host is still guarded.
 */
export function decideRequest(facts: RequestFacts): RequestDecision {
  let url: URL;
  try {
    url = new URL(facts.url);
  } catch {
    return 'block';
  }
  if (isHostedBackendHost(url.hostname)) return 'stop-run';
  if (!isWeb(url)) return 'block';
  if (url.origin === facts.devOrigin) return 'dev-server';

  if (!isLoopbackHost(url.hostname)) {
    if (facts.cutOff) return 'offline';
    return facts.method === 'GET' && FONT_HOSTS.includes(url.hostname.toLowerCase())
      ? 'pass'
      : 'block';
  }

  const rpc = rpcName(url.pathname);
  if (rpc !== undefined && facts.stagedRpcs.has(rpc) && !isReadMethod(facts.method)) {
    return 'answer';
  }
  if (facts.cutOff) return 'offline';
  if (!isReadRequest(facts.method, url.pathname)) return 'refuse-write';
  const patched =
    facts.patchPaths !== undefined &&
    url.pathname.startsWith('/rest/v1/') &&
    facts.patchPaths.test(url.pathname);
  return patched ? 'patch' : 'pass';
}

type SocketDecision =
  /** A hosted Supabase project: the run stops. */
  | 'stop-run'
  /** Anything else, the dev server's HMR socket included: held in the browser. */
  | 'hold';

/**
 * What happens to a WebSocket the page opens. Neither answer connects it to a server: a
 * capture needs no realtime and no hot reload, so there is no socket to let through.
 */
export function decideSocket(url: string): SocketDecision {
  try {
    return isHostedBackendHost(new URL(url).hostname) ? 'stop-run' : 'hold';
  } catch {
    return 'hold';
  }
}

/** The error a stopped run throws, naming the request that stopped it. */
export function stopMessage(what: string): string {
  return (
    `Capture stopped: the app asked for ${what}, a hosted Supabase project. Nothing was sent. ` +
    'A capture runs against an isolated stack only: start one with ' +
    '`pnpm qa:isolated-e2e:prepare`, point the dev server at it (VITE_SUPABASE_URL and ' +
    'VITE_SUPABASE_ANON_KEY) and run again. On a PC without Docker, run the Landing capture ' +
    'workflow instead.'
  );
}

/**
 * A patch that drops rows must also shrink Content-Range ("0-48/49", or "*\/49" on a count
 * probe), or the app's sync sees fewer rows than the server promised and treats its copy of
 * the show as incomplete.
 */
export function rangeHeaders(
  headers: Record<string, string>,
  before: unknown,
  after: unknown
): Record<string, string> {
  const range = headers['content-range']?.match(/^(?:(\d+)-(\d+)|\*)\/(\d+|\*)$/);
  if (!range || !Array.isArray(before) || !Array.isArray(after)) return headers;
  const dropped = before.length - after.length;
  if (dropped === 0) return headers;
  const [, from, to, total] = range;
  const count = total === '*' ? '*' : String(Number(total) - dropped);
  const end = Number(to) - dropped;
  const rows = from === undefined || end < Number(from) ? '*' : `${from}-${end}`;
  return { ...headers, 'content-range': `${rows}/${count}` };
}

// --- Fixture rows and what is on screen --------------------------------------------------

export type Row = Record<string, unknown>;
export const isRow = (v: unknown): v is Row =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A row that carries an armband is kept only when the armband is on the scene's list. */
export function isFixtureRow(row: unknown, fixtures: ReadonlySet<number>): boolean {
  if (!isRow(row)) return true;
  const key = 'armband' in row ? 'armband' : 'armband_number' in row ? 'armband_number' : null;
  return key === null || fixtures.has(Number(row[key]));
}

/**
 * The rows the app is shown for a patched read: rows off the fixture list are dropped, and
 * the fields a staged write "sent" are laid over the row with the same id.
 */
export function patchFixtureRows(
  body: unknown,
  fixtures: ReadonlySet<number>,
  accepted: ReadonlyMap<string, Row>
): unknown {
  if (!Array.isArray(body)) return body;
  return body
    .filter(row => isFixtureRow(row, fixtures))
    .map(row => {
      const sent = isRow(row) && typeof row.id === 'string' ? accepted.get(row.id) : undefined;
      return sent ? { ...row, ...sent } : row;
    });
}

/**
 * Armbands on screen that are not on the scene's list. `labels` are the texts of the
 * elements that show an armband (data-testid ending in "armband"); `text` is the page's
 * visible text, where "#123" is how a class card names the dog in the ring. A label with no
 * number in it is reported as it is, so an unreadable armband never passes.
 */
export function strangerArmbands(
  text: string,
  labels: readonly string[],
  fixtures: ReadonlySet<number>
): string[] {
  const seen = [
    ...labels.map(label => label.match(/\d+/)?.[0] ?? `"${label.trim()}"`),
    ...[...text.matchAll(/#(\d+)/g)].map(m => m[1] ?? ''),
  ];
  return [...new Set(seen)].filter(shown => !fixtures.has(Number(shown)));
}

/**
 * Finds every element that shows an armband: Ringside's dog card, scoresheet header and
 * score confirmation (`dog-card-armband`, `scoresheet-armband`, `confirmation-armband`).
 * landingCaptureGuardWiring.test.ts fails if one of those components stops carrying its id.
 */
export const ARMBAND_SELECTOR = '[data-testid$="armband"]';

type ShotDeps<T> = {
  /** Throws when the run has been stopped (guard.assertIsolated). */
  assertIsolated(): void;
  /** What is on screen now: the visible text and the armband elements' texts. */
  read(): Promise<{ text: string; labels: readonly string[] }>;
  /** Takes the pixels, in memory. */
  take(): Promise<T>;
  /** Writes the image file. */
  save(shot: T): Promise<void> | void;
};

/**
 * The only way a capture writes an image. `minLabels` is how many armband elements the
 * screen is known to show, so a screen where the check found nothing to check cannot pass
 * as clean. The file is written last: after the stop check, the on-screen armband check,
 * and the stop check again once the pixels are taken, so a request that stopped the run
 * while the screenshot was being made leaves no file.
 */
export async function writeCheckedShot<T>(
  shot: { name: string; fixtures: ReadonlySet<number>; minLabels: number },
  deps: ShotDeps<T>
): Promise<void> {
  deps.assertIsolated();
  const { text, labels } = await deps.read();
  if (labels.length < shot.minLabels) {
    throw new Error(
      `${shot.name}: ${labels.length} armband element(s) on screen, at least ${shot.minLabels} expected; the armband check has nothing to read`
    );
  }
  const strangers = strangerArmbands(text, labels, shot.fixtures);
  if (strangers.length > 0) {
    throw new Error(
      `${shot.name}: armband ${strangers.join(', ')} on screen is not a seed fixture`
    );
  }
  const pixels = await deps.take();
  deps.assertIsolated();
  await deps.save(pixels);
}
