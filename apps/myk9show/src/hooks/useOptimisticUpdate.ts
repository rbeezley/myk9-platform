/**
 * useOptimisticUpdate - Simple optimistic update hook for score submissions
 *
 * Provides a consistent interface for optimistic updates with retry logic.
 * Used by useOptimisticScoring for offline-first score submissions.
 */

import { useState, useCallback, useRef } from 'react';

interface UpdateOptions<T> {
  /** Data to store optimistically before server confirms */
  optimisticData: T;
  /** Function to sync with server */
  serverUpdate: () => Promise<T>;
  /** Called on successful server sync */
  onSuccess?: () => void;
  /** Called if server sync fails after all retries */
  onError?: (error: Error) => void;
  /** Called if we need to rollback the optimistic update */
  onRollback?: () => void;
  /** Max retry attempts (default: 3) */
  maxRetries?: number;
  /** Base retry delay in ms (default: 1000) */
  retryDelay?: number;
}

export function useOptimisticUpdate() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const update = useCallback(async <T>(options: UpdateOptions<T>) => {
    const {
      serverUpdate,
      onSuccess,
      onError,
      onRollback,
      maxRetries = 3,
      retryDelay = 1000,
    } = options;

    setIsSyncing(true);
    setHasError(false);
    setError(null);
    setRetryCount(0);

    // Create abort controller for this update
    abortControllerRef.current = new AbortController();

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < maxRetries) {
      try {
        await serverUpdate();

        // Success!
        setIsSyncing(false);
        setHasError(false);
        setError(null);
        onSuccess?.();
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        attempts++;
        setRetryCount(attempts);

        // Check if this is an offline error (should be queued, not retried here)
        if (lastError.message.includes('Offline')) {
          // Don't retry offline errors - they're handled by the offline queue
          break;
        }

        // If we have more retries, wait with exponential backoff
        if (attempts < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempts - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted or offline
    setIsSyncing(false);
    setHasError(true);
    setError(lastError);
    onError?.(lastError!);
    onRollback?.();
  }, []);

  const clearError = useCallback(() => {
    setHasError(false);
    setError(null);
    setRetryCount(0);
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsSyncing(false);
  }, []);

  return {
    update,
    isSyncing,
    hasError,
    error,
    retryCount,
    clearError,
    cancel,
  };
}
