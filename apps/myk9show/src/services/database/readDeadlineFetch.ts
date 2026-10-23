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
 * Every `/rest/v1` GET is deadlined, bulk sync pages included. A page that exceeds 30 s on
 * a saturated server now fails visibly (refresh toast) and the next pass retries. The 30 s
 * value is to be confirmed at the next load rehearsal.
 *
 * AbortError vs TimeoutError. An `AbortError` means somebody cancelled on purpose: the
 * replication layer (`syncErrorUtils.isAbortSyncMessage`) treats it as a cancelled sync,
 * files it as idle and even dismisses an earlier failure toast. The deadline must not hide
 * behind that, so it aborts with a `TimeoutError` DOMException instead. fetch rejects with
 * the signal's reason; postgrest-js (2.118) rethrows a TimeoutError whose signal is aborted
 * without its own retry and, with `throwOnError` off, maps it to
 * `error.message = "TimeoutError: Read deadline of 30000 ms exceeded"`. The sync adapter's
 * `Supabase query failed:` prefix then makes it SAFE_SYNC_REFRESH_ERROR, a visible refresh
 * failure. `isTransientBrowserFetchError` (services/rbac/PermissionChecker.ts) accepts
 * TimeoutError, so the RBAC retry (3 attempts), `classifyRefreshFailure` and the
 * registrations `serverUnreachable` path still treat it as transient.
 *
 * The timer outlives a fast response on purpose. postgrest-js reads the body (`res.text()`)
 * after this layer returns, so clearing at headers would leave a stalled body unbounded and
 * would also drop a caller's `.abortSignal()` that fires after headers. The timer is
 * therefore cleared only when it fires, when the caller aborts, or when the base fetch
 * rejects (nothing left to abort). Aborting a fully consumed response is a harmless no-op.
 *
 * Composition (supabaseClient.ts): `createStepUpFetch(requestStepUp, createReadDeadlineFetch())`.
 * The deadline sits UNDER the step-up layer, so a step-up replay arms a fresh deadline.
 */
type Fetch = typeof fetch;

/** Above the G9 p95 of ~19 s, below the gateway's own cutoff. */
export const SUPABASE_READ_DEADLINE_MS = 30_000;

export const READ_DEADLINE_ERROR_NAME = 'TimeoutError';

/** The abort reason for a read that outlived its deadline. */
export function readDeadlineReason(deadlineMs: number = SUPABASE_READ_DEADLINE_MS): DOMException {
  return new DOMException(`Read deadline of ${deadlineMs} ms exceeded`, READ_DEADLINE_ERROR_NAME);
}

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

function isRequestObject(input: RequestInfo | URL): input is Request {
  return typeof Request !== 'undefined' && input instanceof Request;
}

function methodOf(input: RequestInfo | URL, init?: RequestInit): string {
  return (init?.method ?? (isRequestObject(input) ? input.method : 'GET')).toUpperCase();
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
    const callerSignal = init?.signal ?? (isRequestObject(input) ? input.signal : undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    };
    function onCallerAbort() {
      settle();
      controller.abort(callerSignal?.reason);
    }
    if (callerSignal?.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
      timer = setTimeout(() => {
        settle();
        controller.abort(readDeadlineReason(deadlineMs));
      }, deadlineMs);
    }
    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      settle();
      throw error;
    }
  };
}
