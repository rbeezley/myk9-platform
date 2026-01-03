import { useState, useCallback, useRef } from 'react';
import { haptic } from './useHapticFeedback';
import { logger } from '@/utils/logger';

/**
 * Hook for optimistic UI updates with automatic rollback on failure
 *
 * Pattern:
 * 1. Update UI immediately (optimistic)
 * 2. Send request to server in background
 * 3. Rollback if server rejects
 * 4. Queue for retry if offline
 *
 * @example
 * const { update, isSyncing, hasError } = useOptimisticUpdate();
 *
 * const handleStatusChange = async (newStatus: string) => {
 *   await update({
 *     optimisticData: { status: newStatus },
 *     serverUpdate: () => updateEntryStatus(entryId, newStatus),
 *     onSuccess: (data) => logger.log('Synced:', data),
 *     onError: (error) => toast.error('Failed to sync'),
 *   });
 * };
 */

export interface OptimisticUpdateOptions<T> {
  /** The optimistic data to show immediately */
  optimisticData: T;
  /** Function that performs the server update */
  serverUpdate: () => Promise<T>;
  /** Called when server update succeeds */
  onSuccess?: (data: T) => void;
  /** Called when server update fails */
  onError?: (error: Error) => void;
  /** Called when rolled back */
  onRollback?: () => void;
  /** Maximum retry attempts if offline (default: 3) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
}

export interface OptimisticUpdateResult {
  /** Whether currently syncing with server */
  isSyncing: boolean;
  /** Whether last update failed */
  hasError: boolean;
  /** Error message if failed */
  error: Error | null;
  /** Number of retry attempts */
  retryCount: number;
  /** Perform optimistic update */
  update: <T>(options: OptimisticUpdateOptions<T>) => Promise<void>;
  /** Clear error state */
  clearError: () => void;
}

export function useOptimisticUpdate(): OptimisticUpdateResult {
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => {
    setHasError(false);
    setError(null);
    setRetryCount(0);
  }, []);

  const update = useCallback(async <T>(options: OptimisticUpdateOptions<T>) => {
    const {
      optimisticData: _optimisticData, // Unused but part of the interface for caller's use
      serverUpdate,
      onSuccess,
      onError,
      onRollback,
      maxRetries = 3,
      retryDelay = 1000,
    } = options;

    // Cancel any pending update
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    // Reset error state
    setHasError(false);
    setError(null);
    setIsSyncing(true);

    // Optimistic update is handled by the caller
    // They update their local state before calling this hook

    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts <= maxRetries) {
      try {
        // Check if we've been aborted
        if (abortControllerRef.current.signal.aborted) {
          setIsSyncing(false);
          return;
        }

        // Perform server update
        const serverData = await serverUpdate();

        // Success!
        haptic.success(); // Double pulse for successful sync
        setIsSyncing(false);
        setRetryCount(0);
        onSuccess?.(serverData);
        return;

      } catch (err) {
        lastError = err as Error;
        attempts++;
        setRetryCount(attempts);

        // Check if it's a network error (offline)
        const errorMessage = err instanceof Error ? err.message : '';
        const isNetworkError =
          err instanceof TypeError ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('Network request failed');

        // If network error and haven't exceeded retries, wait and retry
        if (isNetworkError && attempts <= maxRetries) {
await new Promise(resolve => setTimeout(resolve, retryDelay * attempts));
          continue;
        }

        // Otherwise, it's a real error - rollback
        break;
      }
    }

    // All retries failed - rollback
    haptic.error(); // Triple pulse for failed sync
    setIsSyncing(false);
    setHasError(true);
    setError(lastError);
    onRollback?.();
    onError?.(lastError!);

  }, []);

  return {
    isSyncing,
    hasError,
    error,
    retryCount,
    update,
    clearError,
  };
}

/**
 * Simpler hook for immediate optimistic updates without complex retry logic
 * Use this for simple status toggles
 */
export function useSimpleOptimistic<T>(
  initialData: T,
  updateFn: (data: T) => Promise<T>
) {
  const [data, setData] = useState<T>(initialData);
  const [isSyncing, setIsSyncing] = useState(false);
  const previousDataRef = useRef<T>(initialData);

  const update = useCallback(async (newData: T) => {
    // Store previous state for rollback
    previousDataRef.current = data;

    // Optimistic update
    setData(newData);
    setIsSyncing(true);

    try {
      // Sync with server
      const serverData = await updateFn(newData);
      setData(serverData);
    } catch (error) {
      // Rollback on error
      setData(previousDataRef.current);
      logger.error('Optimistic update failed:', error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [data, updateFn]);

  return { data, isSyncing, update };
}
