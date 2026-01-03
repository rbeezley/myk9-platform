/**
 * Network Utilities
 *
 * Provides timeout and retry mechanisms for network operations.
 * These utilities help prevent operations from hanging indefinitely
 * and implement exponential backoff for better error recovery.
 */

import { logger } from './logger';

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
  constructor(message: string, public timeoutMs: number) {
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
  operationName: string = 'operation'
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  // Convert PromiseLike to proper Promise (handles Supabase query builders)
  const promise = Promise.resolve(promiseLike);

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(
        `${operationName} timed out after ${timeoutMs}ms`,
        timeoutMs
      ));
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
 * @returns Promise that resolves after the delay
 */
export function backoffDelay(
  attempt: number,
  baseDelayMs: number = DEFAULT_BACKOFF_BASE_MS
): Promise<void> {
  const delay = calculateBackoffDelay(attempt, baseDelayMs);
  logger.log(`[Backoff] Waiting ${delay.toFixed(0)}ms before retry (attempt ${attempt + 1})`);
  return new Promise(resolve => setTimeout(resolve, delay));
}

// ============================================
// RETRY WITH BACKOFF
// ============================================

/**
 * Options for retry operations
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  baseDelayMs?: number;
  /** Timeout for each attempt in ms (default: 15000) */
  timeoutMs?: number;
  /** Operation name for logging */
  operationName?: string;
  /** Whether to retry on specific errors only */
  shouldRetry?: (error: unknown) => boolean;
  /** Callback before each retry */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Executes an async operation with retry and exponential backoff
 *
 * @param operation - The async operation to execute
 * @param options - Retry configuration options
 * @returns The operation result
 * @throws The last error if all retries fail
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   async () => {
 *     const { data, error } = await supabase.from('entries').select('*');
 *     if (error) throw error;
 *     return data;
 *   },
 *   {
 *     maxRetries: 3,
 *     timeoutMs: 15000,
 *     operationName: 'fetch entries'
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BACKOFF_BASE_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    operationName = 'operation',
    shouldRetry = isRetryableError,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Wrap the operation with timeout
      const result = await withTimeout(
        operation(),
        timeoutMs,
        operationName
      );

      if (attempt > 0) {
        logger.log(`[Retry] ${operationName} succeeded on attempt ${attempt + 1}`);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        logger.warn(`[Retry] ${operationName} failed with non-retryable error:`, error);
        throw error;
      }

      // Check if we have retries left
      if (attempt >= maxRetries) {
        logger.error(`[Retry] ${operationName} failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }

      // Log and wait before retrying
      logger.warn(
        `[Retry] ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
        error instanceof Error ? error.message : error
      );

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, error);
      }

      // Wait with exponential backoff
      await backoffDelay(attempt, baseDelayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

// ============================================
// ERROR CLASSIFICATION
// ============================================

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

/**
 * Retry presets for different scenarios
 */
export const RETRY_PRESETS = {
  /** Quick retry for transient failures */
  quick: {
    maxRetries: 2,
    baseDelayMs: 500,
    timeoutMs: TIMEOUT_PRESETS.quick,
  },
  /** Standard retry for normal operations */
  standard: {
    maxRetries: 3,
    baseDelayMs: 1000,
    timeoutMs: TIMEOUT_PRESETS.standard,
  },
  /** Aggressive retry for critical operations */
  aggressive: {
    maxRetries: 5,
    baseDelayMs: 1000,
    timeoutMs: TIMEOUT_PRESETS.bulk,
  },
} as const;
