/**
 * Bounded retry for the packet-cleanup API calls.
 *
 * Run 39390552156 (2026-10-20) cleared packets just as the API recovered from a
 * Cloudflare 52x outage: one read hung for two minutes, came back as a gateway
 * timeout, and the step failed with only the response body's text. A transient
 * gateway failure is worth a few spaced retries; a 4xx is a real answer and is
 * not retried.
 */

/** The fields PostgREST and Storage errors carry, all optional. */
export interface ApiFailure {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  statusCode?: string;
}

export interface ApiResult<T> {
  data: T | null;
  error: ApiFailure | null;
  /** PostgREST's HTTP status; Storage results carry it on `error.status`. */
  status?: number;
}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

/** The script's per-request ceiling: a hung gateway becomes a retryable failure. */
export const PACKET_REQUEST_TIMEOUT_MS = 30_000;
/** Read, Storage remove, row delete, verify. */
export const PACKET_CLEANUP_CALLS = 4;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 4,
  baseDelayMs: 2_000,
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  log: message => console.warn(message),
};

/**
 * The longest the whole cleanup can take when every call times out on every
 * attempt. The workflow step's timeout is sized from this, so the step always
 * outlives its own retries and the last failure reason reaches the log.
 */
export function worstCaseCleanupMs(policy: Pick<RetryPolicy, 'attempts' | 'baseDelayMs'>): number {
  const backoffMs = Array.from(
    { length: policy.attempts - 1 },
    (_, index) => policy.baseDelayMs * 2 ** index
  ).reduce((total, delay) => total + delay, 0);
  return PACKET_CLEANUP_CALLS * (policy.attempts * PACKET_REQUEST_TIMEOUT_MS + backoffMs);
}

function httpStatus(result: ApiResult<unknown>): number | undefined {
  const status = result.error?.status ?? result.status;
  return typeof status === 'number' && status > 0 ? status : undefined;
}

/**
 * No response at all (a fetch failure or our own request timeout), 408, 429,
 * and every 5xx, which includes Cloudflare's 520-530 range.
 */
export function isTransientFailure(result: ApiResult<unknown>): boolean {
  const status = httpStatus(result);
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

export function describeFailure(result: ApiResult<unknown>): string {
  const error = result.error ?? {};
  const status = httpStatus(result);
  const parts = [
    status === undefined ? 'no HTTP response' : `HTTP ${status}`,
    error.code ? `code ${error.code}` : undefined,
    error.statusCode && error.statusCode !== String(status)
      ? `statusCode ${error.statusCode}`
      : undefined,
  ].filter(Boolean);
  const message = error.message?.trim() || 'no error message';
  const extra = [error.details, error.hint].filter(Boolean).join('; ');
  return `${message} (${parts.join(', ')})${extra ? ` — ${extra}` : ''}`;
}

/**
 * Runs `operation` until it succeeds, fails non-transiently, or exhausts the
 * policy, with exponential backoff between attempts. Every failure is logged,
 * and the thrown error names the step, the response, and the attempt count.
 */
export async function withTransientRetry<T>(
  step: string,
  operation: () => PromiseLike<ApiResult<T>>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): Promise<T | null> {
  for (let attempt = 1; ; attempt += 1) {
    const result = await operation();
    if (!result.error) return result.data;

    const transient = isTransientFailure(result);
    const description = describeFailure(result);
    if (!transient || attempt >= policy.attempts) {
      throw new Error(
        `${step}: ${description} after ${attempt} attempt${attempt === 1 ? '' : 's'}` +
          (transient ? '' : ' (not retried: not a transient failure)')
      );
    }
    const delayMs = policy.baseDelayMs * 2 ** (attempt - 1);
    policy.log(
      `${step}: attempt ${attempt}/${policy.attempts} failed, ${description}; retrying in ${delayMs} ms.`
    );
    await policy.sleep(delayMs);
  }
}
