import { describeError } from './error-message';
import {
  calculateBackoffDelay,
  isAuthorizationError,
  isGatewayTransientError,
  isRetryableError,
  isTransportError,
} from './mutation-utils';
import { isServerTransientError } from './mutation-transient';
import type { PendingMutation } from './types';

export interface ClassifyMutationFailureOptions {
  mutation: PendingMutation;
  error: unknown;
  maxRetries: number;
  retryBackoffBase: number;
  /** True only when connectivity evidence says the server is unreachable (see uplink-probe.ts).
   *  Absent or false: a transport-candidate failure spends `maxRetries` like any other. */
  uplinkDown?: boolean;
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
  uplinkDown = false,
  now = Date.now(),
}: ClassifyMutationFailureOptions): MutationFailureClassification {
  const message = describeError(error);
  const canRetry = isRetryableError(error, mutation);
  // MYK9-1474: transport loss, confirmed by the connectivity probe, keeps retrying with capped backoff and spends no retry budget.
  // MYK9-1488: so does a gateway 502/503/504, by its own status and never by the probe (the gateway answered, so the probe says "up").
  // MYK9-2011: and a server answer that means "not this time" (see mutation-transient.ts).
  if (
    canRetry &&
    ((uplinkDown && isTransportError(error)) ||
      isGatewayTransientError(error) ||
      isServerTransientError(error))
  ) {
    const transportRetries = (mutation.transportRetries || 0) + 1;
    const pending: PendingMutation = {
      ...mutation,
      transportRetries,
      status: 'pending',
      error: message,
      nextRetryAt: now + calculateBackoffDelay(transportRetries - 1, retryBackoffBase),
    };
    delete pending.failedAt;
    delete pending.failureKind;
    return { mutation: pending, message, canRetry, permanentlyFailed: false };
  }

  const retries = (mutation.retries || 0) + 1;
  const permanentlyFailed = retries >= maxRetries || !canRetry;
  // The uplink answered (or was never confirmed down): the transport budget no longer applies.
  const withoutTransport: PendingMutation = { ...mutation };
  delete withoutTransport.transportRetries;

  if (permanentlyFailed) {
    const code =
      typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
    const failed: PendingMutation = {
      ...withoutTransport,
      retries,
      status: 'failed',
      error: canRetry ? `Max retries exceeded: ${message}` : `Non-retryable error: ${message}`,
      failureKind: canRetry
        ? 'max-retries'
        : isAuthorizationError(error)
          ? 'authorization'
          : 'permanent',
      failedAt: now,
      // MYK9-2479: the dead letter keeps the server's code, so recovery need not parse its text,
      // and whether a send was lost before it, so "refused on its first send" can be told apart.
      ...(typeof code === 'string' && code.length > 0 && { errorCode: code }),
      ...(mutation.transportRetries ? { priorTransportRetries: mutation.transportRetries } : {}),
    };
    delete failed.nextRetryAt;

    return { mutation: failed, message, canRetry, permanentlyFailed };
  }

  const retryAt = now + calculateBackoffDelay(retries - 1, retryBackoffBase);
  const pending: PendingMutation = {
    ...withoutTransport,
    retries,
    status: 'pending',
    error: message,
    nextRetryAt: retryAt,
  };
  delete pending.failedAt;
  delete pending.failureKind;

  return { mutation: pending, message, canRetry, permanentlyFailed };
}
