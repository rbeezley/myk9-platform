/**
 * Idle Callback Helper Utilities
 *
 * Cross-browser utilities for scheduling tasks during browser idle periods.
 * Provides fallbacks for browsers without requestIdleCallback support (Safari).
 * Extracted from usePrefetch hook for better testability and reusability.
 *
 * @module idleCallbackHelpers
 */

/**
 * Window-like interface for idle callback support
 * Covers both browser and Node.js environments
 */
interface IdleCallbackWindow {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
}

/**
 * Options for idle callback scheduling
 */
export interface IdleCallbackOptions {
  /** Maximum time to wait before executing callback (ms) */
  timeout?: number;
}

/**
 * Schedule a task to run during browser idle time
 *
 * Uses native requestIdleCallback where available, falls back to setTimeout.
 * Safari doesn't support requestIdleCallback, so this provides a consistent API.
 *
 * @param callback - Function to execute during idle time
 * @param options - Scheduling options
 * @returns Idle callback ID (can be used with cancelIdleCallback)
 *
 * @example
 * ```typescript
 * const id = scheduleIdleTask(() => {
 *   logger.log('Running during idle time');
 * });
 * ```
 */
export function scheduleIdleTask(
  callback: () => void,
  options: IdleCallbackOptions = {}
): number {
  const win: IdleCallbackWindow = typeof window !== 'undefined' ? window : globalThis as IdleCallbackWindow;

  if (win.requestIdleCallback) {
    return win.requestIdleCallback(callback, options);
  }
  // Fallback for Safari: use setTimeout with short delay
  return win.setTimeout(callback, 1);
}

/**
 * Cancel a scheduled idle task
 *
 * Uses native cancelIdleCallback where available, falls back to clearTimeout.
 *
 * @param id - ID returned from scheduleIdleTask
 *
 * @example
 * ```typescript
 * const id = scheduleIdleTask(() => logger.log('Task'));
 * cancelIdleTask(id); // Task will not run
 * ```
 */
export function cancelIdleTask(id: number): void {
  const win: IdleCallbackWindow = typeof window !== 'undefined' ? window : globalThis as IdleCallbackWindow;

  if (win.cancelIdleCallback) {
    win.cancelIdleCallback(id);
  } else {
    win.clearTimeout(id);
  }
}

/**
 * Schedule multiple tasks during idle time with priority
 *
 * Higher priority tasks run first. All tasks are scheduled for the same
 * idle period, but execution order respects priority.
 *
 * @param tasks - Array of tasks with priorities
 * @returns Array of idle callback IDs
 *
 * @example
 * ```typescript
 * const ids = scheduleIdleTasks([
 *   { callback: () => logger.log('Low priority'), priority: 1 },
 *   { callback: () => logger.log('High priority'), priority: 10 }
 * ]);
 * // High priority task runs first
 * ```
 */
export function scheduleIdleTasks(
  tasks: Array<{ callback: () => void; priority: number; options?: IdleCallbackOptions }>
): number[] {
  // Sort by priority (highest first)
  const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);

  // Schedule all tasks
  return sortedTasks.map(task => scheduleIdleTask(task.callback, task.options));
}

/**
 * Check if browser supports requestIdleCallback
 *
 * @returns True if native requestIdleCallback is available
 *
 * @example
 * ```typescript
 * if (hasIdleCallbackSupport()) {
 *   logger.log('Browser supports idle callbacks natively');
 * } else {
 *   logger.log('Using setTimeout fallback');
 * }
 * ```
 */
export function hasIdleCallbackSupport(): boolean {
  return typeof window !== 'undefined' && 'requestIdleCallback' in window;
}

/**
 * Schedule task with maximum wait time
 *
 * Guarantees callback runs within timeout period, even if browser never idles.
 * Useful for non-critical but time-sensitive tasks.
 *
 * @param callback - Function to execute
 * @param maxWait - Maximum milliseconds to wait (default: 5000)
 * @returns Idle callback ID
 *
 * @example
 * ```typescript
 * scheduleIdleTaskWithTimeout(
 *   () => logger.log('Task'),
 *   2000
 * );
 * // Task runs during idle time OR after 2 seconds, whichever comes first
 * ```
 */
export function scheduleIdleTaskWithTimeout(
  callback: () => void,
  maxWait: number = 5000
): number {
  let executed = false;
  let timeoutId: number;
  let idleId: number;

  const execute = () => {
    if (executed) return;
    executed = true;

    // Cancel the other timer
    if (timeoutId) window.clearTimeout(timeoutId);
    if (idleId) cancelIdleTask(idleId);

    callback();
  };

  // Schedule idle callback
  idleId = scheduleIdleTask(execute);

  // Schedule timeout as backup
  timeoutId = window.setTimeout(execute, maxWait) as unknown as number;

  return idleId;
}

/**
 * Batch process array during idle time
 *
 * Processes array in chunks during idle periods to avoid blocking the UI.
 * Useful for large data processing operations.
 *
 * @param items - Array to process
 * @param processor - Function to process each item
 * @param batchSize - Items to process per idle period (default: 10)
 * @param onProgress - Optional progress callback
 * @returns Promise that resolves when all items are processed
 *
 * @example
 * ```typescript
 * await processInIdle(
 *   largeArray,
 *   (item) => logger.log(item),
 *   50,
 *   (progress) => logger.log(`${progress}% complete`)
 * );
 * ```
 */
export async function processInIdle<T>(
  items: T[],
  processor: (item: T, index: number) => void | Promise<void>,
  batchSize: number = 10,
  onProgress?: (progress: number) => void
): Promise<void> {
  let processedCount = 0;

  return new Promise((resolve) => {
    const processBatch = () => {
      const batch = items.slice(processedCount, processedCount + batchSize);

      // Process this batch
      batch.forEach((item, i) => {
        processor(item, processedCount + i);
      });

      processedCount += batch.length;

      // Report progress
      if (onProgress) {
        const progress = Math.round((processedCount / items.length) * 100);
        onProgress(progress);
      }

      // Schedule next batch or resolve
      if (processedCount < items.length) {
        scheduleIdleTask(processBatch);
      } else {
        resolve();
      }
    };

    // Start processing
    scheduleIdleTask(processBatch);
  });
}
