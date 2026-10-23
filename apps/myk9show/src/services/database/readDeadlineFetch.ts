/**
 * MYK9-1351: a client-side deadline for the Supabase client's reads.
 *
 * The gates that block first paint (the RBAC load, the show boundary's cold sync, the
 * class and entries syncs) each wait on PostgREST reads. Their retries only start after a
 * failure, so a request that hangs never triggers them: one slow read held a gate open for
 * as long as the gateway allowed (54 HTTP 504s in the G9 baseline).
 *
 * Decision: the deadline applies to READS ONLY, classified here at the fetch layer, so no
 * call site can miss it and none needs its own `.abortSignal()`:
 *   - every PostgREST request to `/rest/v1/` with method GET or HEAD (count queries), and
 *   - POST `/rest/v1/rpc/<name>` where `<name>` is in READ_ONLY_RPCS, the read-only RPCs
 *     that gate first paint.
 * Everything else is untouched: table POST/PATCH/DELETE (the mutation queue), every other
 * RPC (`ringside_update_entry`, `self_checkin_entry`, ... are writes), `/auth/v1/`,
 * `/storage/v1/`, `/functions/v1/` and realtime. A write cut off client-side can still have
 * committed server-side, and the mutation queue would then replay it.
 *
 * Why a timeout surfaces as the failure the existing paths already handle: the abort is a
 * plain `AbortError` (the default `controller.abort()` reason), never `AbortSignal.timeout()`
 * whose `TimeoutError` nothing here recognises. postgrest-js 2.118 rethrows an AbortError
 * from its fetch without its own retry (`fetchWithRetry`) and, with `throwOnError` off, maps
 * the rejection to `error.message = "AbortError: <message>"`. Both `isTransientBrowserFetchError`
 * (services/rbac/PermissionChecker.ts) and `isAbortError` (context/useRbacLifecycle.ts) match
 * that, so the RBAC retry (3 attempts) and the sync layer's abort paths run.
 *
 * Composition (supabaseClient.ts): `createStepUpFetch(requestStepUp, createReadDeadlineFetch())`.
 * The deadline sits UNDER the step-up layer, so a step-up replay arms a fresh deadline.
 */
type Fetch = typeof fetch;

/** Above the G9 p95 of ~19 s, below the gateway's own cutoff. */
export const SUPABASE_READ_DEADLINE_MS = 30_000;

/** Read-only RPCs that gate first paint. Every other RPC is treated as a write. */
export const READ_ONLY_RPCS: ReadonlySet<string> = new Set([
  'get_user_permissions',
  'get_user_roles',
  'get_effective_permissions',
  'user_has_permission',
  'get_account_today_entries',
  'get_show_judges',
  'get_show_class_hide_counts',
]);

const REST_PREFIX = '/rest/v1/';
const RPC_PREFIX = '/rest/v1/rpc/';

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function pathnameOf(input: RequestInfo | URL): string | null {
  try {
    return new URL(urlOf(input), 'http://localhost').pathname;
  } catch {
    return null;
  }
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  const isRequestObject = typeof Request !== 'undefined' && input instanceof Request;
  return (init?.method ?? (isRequestObject ? input.method : 'GET')).toUpperCase();
}

/** True for the requests that get the read deadline. Pure; exported for tests. */
export function isDeadlinedRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  const pathname = pathnameOf(input);
  if (!pathname?.startsWith(REST_PREFIX)) return false;
  const method = methodOf(input, init);
  if (method === 'GET' || method === 'HEAD') return true;
  if (method !== 'POST' || !pathname.startsWith(RPC_PREFIX)) return false;
  return READ_ONLY_RPCS.has(pathname.slice(RPC_PREFIX.length));
}

export function createReadDeadlineFetch(
  baseFetch: Fetch = (input, init) => globalThis.fetch(input, init),
  deadlineMs: number = SUPABASE_READ_DEADLINE_MS
): Fetch {
  return async (input, init) => {
    if (!isDeadlinedRead(input, init)) return baseFetch(input, init);

    const controller = new AbortController();
    const callerSignal = init?.signal;
    const forwardAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) forwardAbort();
    else callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    // Default reason: a DOMException named AbortError, which the transient-error checks match.
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', forwardAbort);
    }
  };
}
