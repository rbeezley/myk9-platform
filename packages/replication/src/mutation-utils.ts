/**
 * Mutation Utilities
 *
 * Provides timeout, backoff, and error classification utilities
 * for the MutationManager. Extracted from myK9Q's networkUtils.ts
 * with dependency injection for the logger.
 */

import type { Logger } from './dependencies';

// ============================================
// CONSTANTS
// ============================================

/** Default timeout for network operations (15 seconds) */
export const DEFAULT_TIMEOUT_MS = 15000;

/** Default maximum retries for failed operations */
export const DEFAULT_MAX_RETRIES = 3;

/** Default base delay for exponential backoff (1 second) */
export const DEFAULT_BACKOFF_BASE_MS = 1000;

/** Maximum backoff delay (30 seconds) */
export const MAX_BACKOFF_MS = 30000;

/** Jitter factor to randomize backoff (0.1 = ±10%) */
export const BACKOFF_JITTER = 0.1;

// ============================================
// TIMEOUT WRAPPER
// ============================================

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public timeoutMs: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

interface AbortablePromiseLike<T> extends PromiseLike<T> {
  abortSignal(signal: AbortSignal): PromiseLike<T>;
}

function isAbortablePromiseLike<T>(value: PromiseLike<T>): value is AbortablePromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'abortSignal' in value &&
    typeof (value as { abortSignal?: unknown }).abortSignal === 'function'
  );
}

/**
 * Wraps a promise or thenable with a timeout
 *
 * Note: Accepts PromiseLike<T> to support Supabase query builders,
 * which are thenable but not true Promises.
 *
 * @param promiseLike - The promise or thenable to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation (for error messages)
 * @returns The promise result if it completes within the timeout
 * @throws TimeoutError if the promise doesn't complete in time
 *
 * @example
 * ```ts
 * const result = await withTimeout(
 *   supabase.from('entries').select('*'),
 *   15000,
 *   'fetch entries'
 * );
 * ```
 */
export async function withTimeout<T>(
  promiseLike: PromiseLike<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  operationName: string = 'operation'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | undefined;
  let boundedPromiseLike = promiseLike;

  // Supabase query builders expose abortSignal(). Attach it before Promise.resolve
  // assimilates the thenable and starts the request, so a local timeout also stops
  // the underlying transport instead of leaving it alive beside the next retry.
  if (typeof AbortController !== 'undefined' && isAbortablePromiseLike(promiseLike)) {
    abortController = new AbortController();
    boundedPromiseLike = promiseLike.abortSignal(abortController.signal);
  }
  const promise = Promise.resolve(boundedPromiseLike);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new TimeoutError(
        `${operationName} timed out after ${timeoutMs}ms`,
        timeoutMs
      );
      reject(timeoutError);
      abortController?.abort(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ============================================
// EXPONENTIAL BACKOFF
// ============================================

/**
 * Calculates exponential backoff delay with jitter
 *
 * Formula: min(baseDelay * 2^attempt * (1 ± jitter), maxDelay)
 *
 * @param attempt - The current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap
 * @returns Delay in milliseconds
 *
 * @example
 * Attempt 0: ~1000ms (1s)
 * Attempt 1: ~2000ms (2s)
 * Attempt 2: ~4000ms (4s)
 * Attempt 3: ~8000ms (8s)
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number = DEFAULT_BACKOFF_BASE_MS,
  maxDelayMs: number = MAX_BACKOFF_MS
): number {
  // Exponential backoff: base * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Add jitter to prevent thundering herd
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * BACKOFF_JITTER;
  const delayWithJitter = exponentialDelay * jitterMultiplier;

  // Cap at maximum delay
  return Math.min(delayWithJitter, maxDelayMs);
}

/**
 * Sleeps for the calculated backoff delay
 *
 * @param attempt - The current attempt number
 * @param baseDelayMs - Base delay in milliseconds
 * @param logger - Optional logger for backoff messages
 * @returns Promise that resolves after the delay
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number = DEFAULT_BACKOFF_BASE_MS,
  logger?: Logger
): Promise<void> {
  const delay = calculateBackoffDelay(attempt, baseDelayMs);
  if (logger) {
    logger.log(`[Backoff] Waiting ${delay.toFixed(0)}ms before retry (attempt ${attempt + 1})`);
  }
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ============================================
// ERROR CLASSIFICATION
// ============================================

/**
 * Type guard for Supabase errors
 */
interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

function isSupabaseError(error: unknown): error is SupabaseError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  if (typeof candidate.message !== 'string') return false;
  // Reject DOMException and other web/idb errors that share { message: string }
  // but use a numeric `code` — `code?.startsWith(...)` would TypeError on those
  // and abort the whole upload batch via the outer catch in uploadPendingMutations.
  if ('code' in candidate && candidate.code !== undefined && typeof candidate.code !== 'string') {
    return false;
  }
  return true;
}

/**
 * Whether an error is an authorization/permission rejection.
 *
 * Kept separate from retryability so a dead letter can preserve the reason
 * after the original structured error has been reduced to a display string.
 */
export function isAuthorizationError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as Record<string, unknown>;
  const code = typeof candidate.code === 'string' ? candidate.code : undefined;
  const message =
    typeof candidate.message === 'string' ? candidate.message.toLowerCase() : undefined;
  const isExplicitPermissionRejection =
    message?.includes('row-level security') === true ||
    message?.includes('rls policy') === true ||
    message?.includes('permission denied') === true;

  if (code === '42501' || isExplicitPermissionRejection) return true;

  // Broad authorization wording is trustworthy only when it comes with a
  // structured server code. Plain Error messages such as an expired-session
  // gateway "Unauthorized" are ambiguous and must retain fail-open retries.
  return (
    code !== undefined &&
    (message?.includes('not authorized') === true ||
      message?.includes('unauthorized') === true ||
      message?.includes('forbidden') === true)
  );
}

/**
 * Determines if an error is retryable
 *
 * Retryable errors include:
 * - Network errors (fetch failed, connection reset)
 * - Timeout errors
 * - Server errors (5xx)
 * - Rate limiting (429)
 *
 * Affirmatively-permanent (non-retryable) errors — these dead-letter on the
 * first failure because retrying can never succeed without a code/data/role fix:
 * - Client errors (4xx except 429)
 * - Integrity/constraint violations (Postgres class 23xxx)
 * - RLS / permission denials (42501, "row-level security")
 * - Authentication/authorization failures
 *
 * FAIL-OPEN default: anything NOT affirmatively classified as permanent is
 * treated as retryable. A dog-show score must never be discarded because an
 * ambiguous, unrecognized error (AbortError, statement timeout 57014, an
 * unusual 5xx body) was pattern-missed and dead-lettered on the first try. The
 * cost of an over-retry is a wasted request; the cost of an over-eager
 * dead-letter is a lost score. See July 2026 replication audit finding H2.
 *
 * @param error - The error to check
 * @returns true if the error is retryable (the default for anything ambiguous)
 */
export function isRetryableError(error: unknown): boolean {
  // Timeout errors are always retryable
  if (error instanceof TimeoutError) {
    return true;
  }

  // Check for network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Affirmatively-permanent classification for Supabase/PostgreSQL errors.
  if (isSupabaseError(error)) {
    const message = error.message.toLowerCase();
    const code = error.code;

    // Rate limiting is retryable (429 is a 4xx but transient).
    if (code === '429' || message.includes('rate limit')) {
      return true;
    }

    // Integrity/constraint violations (Postgres class 23) never succeed on retry.
    if (code?.startsWith('23')) {
      return false;
    }

    // RLS / insufficient-privilege denials need a role/permission fix.
    if (isAuthorizationError(error)) {
      return false;
    }

    // Client errors (4xx, except 429 handled above) are permanent.
    if (code?.startsWith('4') && code !== '429') {
      return false;
    }

    // Any other Supabase error (5xx, connection, statement timeout 57014,
    // unrecognized codes) falls through to the fail-open default below.
  }

  // Generic Error objects: only affirmatively-permanent messages dead-letter.
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (isAuthorizationError(error) || message.includes('violates')) {
      return false;
    }
  }

  // FAIL-OPEN default: retry anything not proven permanent, so an ambiguous
  // error never silently discards a score.
  return true;
}

// ============================================
// CONVENIENCE WRAPPERS
// ============================================

/**
 * Timeout presets for different operation types
 */
export const TIMEOUT_PRESETS = {
  /** Quick operations (list, count) */
  quick: 5000,
  /** Standard operations (CRUD) */
  standard: 15000,
  /** Bulk operations (large syncs) */
  bulk: 60000,
  /** Long-running operations (migrations) */
  long: 120000,
} as const;
