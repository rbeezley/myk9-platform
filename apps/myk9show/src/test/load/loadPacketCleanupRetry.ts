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
  /**
   * Epoch ms after which no retry starts, shared by every call in one cleanup so
   * the whole sequence fits inside the workflow step's own timeout.
   */
  deadlineAtMs?: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  log: (message: string) => void;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  attempts: 4,
  baseDelayMs: 2_000,
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  log: message => console.warn(message),
};

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
    const delayMs = policy.baseDelayMs * 2 ** (attempt - 1);
    const pastDeadline =
      policy.deadlineAtMs !== undefined && policy.now() + delayMs >= policy.deadlineAtMs;
    if (!transient || attempt >= policy.attempts || pastDeadline) {
      const reason = !transient
        ? ' (not retried: not a transient failure)'
        : attempt < policy.attempts
          ? ' (retry budget exhausted)'
          : '';
      throw new Error(
        `${step}: ${description} after ${attempt} attempt${attempt === 1 ? '' : 's'}${reason}`
      );
    }
    policy.log(
      `${step}: attempt ${attempt}/${policy.attempts} failed, ${description}; retrying in ${delayMs} ms.`
    );
    await policy.sleep(delayMs);
  }
}
