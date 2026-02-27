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
    public timeoutMs: number,
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
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
  operationName: string = 'operation',
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  // Convert PromiseLike to proper Promise (handles Supabase query builders)
  const promise = Promise.resolve(promiseLike);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operationName} timed out after ${timeoutMs}ms`, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    throw error;
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
  maxDelayMs: number = MAX_BACKOFF_MS,
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
  logger?: Logger,
): Promise<void> {
  const delay = calculateBackoffDelay(attempt, baseDelayMs);
  if (logger) {
    logger.log(`[Backoff] Waiting ${delay.toFixed(0)}ms before retry (attempt ${attempt + 1})`);
  }
  return new Promise((resolve) => setTimeout(resolve, delay));
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
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
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
 * Non-retryable errors include:
 * - Client errors (4xx except 429)
 * - Validation errors
 * - Authentication errors
 *
 * @param error - The error to check
 * @returns true if the error is retryable
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

  // Check for Supabase/PostgreSQL errors
  if (isSupabaseError(error)) {
    const message = error.message.toLowerCase();
    const code = error.code;

    // Rate limiting is retryable
    if (code === '429' || message.includes('rate limit')) {
      return true;
    }

    // Server errors (5xx) are retryable
    if (code?.startsWith('5') || message.includes('server error')) {
      return true;
    }

    // Connection errors are retryable
    if (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('socket hang up')
    ) {
      return true;
    }

    // Client errors (4xx) are generally not retryable
    if (code?.startsWith('4') && code !== '429') {
      return false;
    }
  }

  // Check for generic Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // RLS policy rejections are never retryable (need role/permission fix)
    if (message.includes('rls policy blocked')) {
      return false;
    }

    // Network-related errors are retryable
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('econnreset') ||
      message.includes('socket')
    ) {
      return true;
    }
  }

  // Default: don't retry unknown errors
  return false;
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
