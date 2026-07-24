import { calculateBackoffDelay, isAuthorizationError, isRetryableError } from './mutation-utils';
import type { PendingMutation } from './types';

export interface ClassifyMutationFailureOptions {
  mutation: PendingMutation;
  error: unknown;
  maxRetries: number;
  retryBackoffBase: number;
  now?: number;
}

export interface MutationFailureClassification {
  mutation: PendingMutation;
  message: string;
  canRetry: boolean;
  permanentlyFailed: boolean;
}

export function classifyMutationFailure({
  mutation,
  error,
  maxRetries,
  retryBackoffBase,
  now = Date.now(),
}: ClassifyMutationFailureOptions): MutationFailureClassification {
  const message = error instanceof Error ? error.message : String(error);
  const canRetry = isRetryableError(error);
  const retries = (mutation.retries || 0) + 1;
  const permanentlyFailed = retries >= maxRetries || !canRetry;

  if (permanentlyFailed) {
    const failed: PendingMutation = {
      ...mutation,
      retries,
      status: 'failed',
      error: canRetry ? `Max retries exceeded: ${message}` : `Non-retryable error: ${message}`,
      failureKind: canRetry
        ? 'max-retries'
        : isAuthorizationError(error)
          ? 'authorization'
          : 'permanent',
      failedAt: now,
    };
    delete failed.nextRetryAt;

    return { mutation: failed, message, canRetry, permanentlyFailed };
  }

  const retryAt = now + calculateBackoffDelay(retries - 1, retryBackoffBase);
  const pending: PendingMutation = {
    ...mutation,
    retries,
    status: 'pending',
    error: message,
    nextRetryAt: retryAt,
  };
  delete pending.failedAt;
  delete pending.failureKind;

  return { mutation: pending, message, canRetry, permanentlyFailed };
}
