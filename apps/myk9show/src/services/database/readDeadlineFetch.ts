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
 * MYK9-1421: the deadline is also the TOTAL budget of one logical read. postgrest-js retried
 * network errors and 503/520 on its own (3 retries, 1/2/4 s backoff, Retry-After honoured),
 * and each attempt got a fresh deadline, so quick failures could hold a read for ~4 x 30 s.
 * The main client now sets `db.retry: false` and this layer runs the same retry policy under
 * ONE controller and ONE timer: attempts share the remaining budget, and a retry whose wait
 * would not end strictly inside the budget (including a long Retry-After) is not started; the
 * last response or error is returned at once. Caller cancellation aborts the wait immediately.
 * Expected first paint: a read never outlives 30 s from its first byte sent, as MYK9-1351 intended.
 *
 * AbortError vs TimeoutError. An `AbortError` means somebody cancelled on purpose: the
 * replication layer (`syncErrorUtils.isAbortSyncMessage`) treats it as a cancelled sync,
 * files it as idle and even dismisses an earlier failure toast. The deadline must not hide
 * behind that, so it aborts with a `TimeoutError` instead. fetch rejects with the signal's
 * reason. Its `ABORT_ERR` code tells postgrest-js not to retry this private-controller abort
 * (MYK9-1355); the SDK's ordinary network/503/520 retries remain enabled. With `throwOnError`
 * off, the SDK maps it to
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

/** A visible timeout whose abort code also stops the SDK's transport retry loop. */
export class ReadDeadlineError extends Error {
  override readonly name = READ_DEADLINE_ERROR_NAME;
  readonly code = 'ABORT_ERR' as const;

  constructor(deadlineMs: number) {
    super(`Read deadline of ${deadlineMs} ms exceeded`);
  }
}

/** The abort reason for a read that outlived its deadline. */
export function readDeadlineReason(
  deadlineMs: number = SUPABASE_READ_DEADLINE_MS
): ReadDeadlineError {
  return new ReadDeadlineError(deadlineMs);
}

const READ_DEADLINE_MESSAGE = /Read deadline of \d+ ms exceeded/;

/**
 * True for the failure a read-deadline abort produces, however it surfaces: the
 * Error or a TimeoutError DOMException, postgrest-js's rethrow, a `DatabaseError` or sync
 * message that carries its text, or any error whose `cause` chain holds one.
 *
 * Why a caller cares (MYK9-1374): PostgREST does not cancel the statement when
 * the client disconnects (PostgREST issue #699, still open), so the server is
 * still running the read this client gave up on. A retry fired straight away
 * queues a second copy behind the first on a saturated database. Callers that
 * retry transient failures therefore retry a deadline timeout once, later.
 */
export function isReadDeadlineTimeout(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 4) return false;
  const { name, message, cause } = error as { name?: unknown; message?: unknown; cause?: unknown };
  if (name === READ_DEADLINE_ERROR_NAME) return true;
  if (typeof message === 'string' && READ_DEADLINE_MESSAGE.test(message)) return true;
  return cause !== undefined && cause !== error && isReadDeadlineTimeout(cause, depth + 1);
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

/** Same retry policy postgrest-js applies by default (fetchWithRetry), now bounded by the budget. */
export const READ_RETRY_MAX = 3;
const READ_RETRY_STATUSES: ReadonlySet<number> = new Set([503, 520]);
const readRetryDelayMs = (retryIndex: number) => Math.min(1000 * 2 ** retryIndex, 30_000);

/** Retry-After in seconds, parsed exactly as postgrest-js does; null when absent. */
function retryAfterMs(res: Response): number | null {
  const header = res.headers?.get('Retry-After') ?? null;
  return header === null ? null : Math.max(0, parseInt(header, 10) || 0) * 1000;
}

function withRetryCount(
  init: RequestInit | undefined,
  retryCount: number
): RequestInit | undefined {
  if (retryCount === 0) return init;
  const headers = new Headers(init?.headers);
  headers.set('X-Retry-Count', String(retryCount));
  return { ...init, headers };
}

/** Resolves after `ms`, or rejects with the signal's reason the moment it aborts. */
function sleepUnlessAborted(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(signal.reason);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAbortLike(error: unknown, signal: AbortSignal): boolean {
  const { name, code } = (error ?? {}) as { name?: unknown; code?: unknown };
  return (
    name === 'AbortError' || code === 'ABORT_ERR' || (name === 'TimeoutError' && signal.aborted)
  );
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
    const startedAt = Date.now();
    if (callerSignal?.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
      timer = setTimeout(() => {
        settle();
        controller.abort(readDeadlineReason(deadlineMs));
      }, deadlineMs);
    }

    // Only idempotent reads are retried, as postgrest-js did (POST read-only RPCs never were).
    const retryable = ['GET', 'HEAD'].includes(methodOf(input, init));
    // A retry may start only if its wait ends strictly inside the budget; otherwise the last
    // failure is surfaced now instead of sleeping into a deadline abort.
    const fitsBudget = (waitMs: number) => Date.now() - startedAt + waitMs < deadlineMs;

    try {
      for (let retryCount = 0; ; retryCount++) {
        let res: Response;
        try {
          res = await baseFetch(input, {
            ...withRetryCount(init, retryCount),
            signal: controller.signal,
          });
        } catch (error) {
          const waitMs = readRetryDelayMs(retryCount);
          if (
            isAbortLike(error, controller.signal) ||
            controller.signal.aborted ||
            !retryable ||
            retryCount >= READ_RETRY_MAX ||
            !fitsBudget(waitMs)
          ) {
            throw error;
          }
          await sleepUnlessAborted(waitMs, controller.signal);
          continue;
        }
        if (!retryable || !READ_RETRY_STATUSES.has(res.status) || retryCount >= READ_RETRY_MAX) {
          return res;
        }
        const waitMs = retryAfterMs(res) ?? readRetryDelayMs(retryCount);
        if (!fitsBudget(waitMs)) return res;
        await res.text().catch(() => undefined);
        await sleepUnlessAborted(waitMs, controller.signal);
      }
    } catch (error) {
      settle();
      throw error;
    }
  };
}
