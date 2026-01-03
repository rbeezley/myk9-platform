/**
 * Idle Work Utilities
 *
 * Defer non-critical work to idle time using requestIdleCallback.
 * Improves responsiveness by prioritizing user interactions.
 */

import { logger } from '@/utils/logger';

export interface IdleWorkOptions {
  /** Timeout in ms (work will run even if not idle) */
  timeout?: number;

  /** Priority: high = 1s timeout, medium = 2s, low = 5s */
  priority?: 'high' | 'medium' | 'low';
}

export interface IdleTask {
  id: number;
  callback: () => void | Promise<void>;
  timeout: number;
  priority: 'high' | 'medium' | 'low';
  scheduled: number;
}

let taskIdCounter = 0;
const pendingTasks: IdleTask[] = [];
const runningTasks = new Set<number>();

/**
 * Polyfill for requestIdleCallback
 */
const requestIdleCallbackPolyfill =
  window.requestIdleCallback ||
  function (callback: IdleRequestCallback, _options?: IdleRequestOptions): number {
    const start = Date.now();
    return setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      } as IdleDeadline);
    }, 1) as unknown as number;
  };

/**
 * Schedule work during idle time
 */
export function scheduleIdleWork(
  callback: () => void | Promise<void>,
  options: IdleWorkOptions = {}
): number {
  const { priority = 'medium', timeout } = options;

  // Determine timeout based on priority
  let finalTimeout = timeout;
  if (!finalTimeout) {
    if (priority === 'high') finalTimeout = 1000;
    else if (priority === 'medium') finalTimeout = 2000;
    else finalTimeout = 5000;
  }

  const task: IdleTask = {
    id: ++taskIdCounter,
    callback,
    timeout: finalTimeout,
    priority,
    scheduled: Date.now(),
  };

  pendingTasks.push(task);

  // Sort by priority (high -> medium -> low)
  pendingTasks.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  processIdleQueue();

  return task.id;
}

/**
 * Cancel scheduled idle work
 */
export function cancelIdleWork(taskId: number): void {
  const index = pendingTasks.findIndex(task => task.id === taskId);
  if (index !== -1) {
    pendingTasks.splice(index, 1);
  }
  runningTasks.delete(taskId);
}

/**
 * Process the idle queue
 */
function processIdleQueue(): void {
  if (pendingTasks.length === 0) return;

  const task = pendingTasks.shift()!;

  runningTasks.add(task.id);

  requestIdleCallbackPolyfill(
    async (deadline) => {
      try {
        // Check if we have enough time or timeout has passed
        const elapsed = Date.now() - task.scheduled;
        const shouldRun = deadline.timeRemaining() > 0 || elapsed >= task.timeout;

        if (shouldRun) {
          await task.callback();
        } else {
          // Re-queue if not enough time and not timed out
          pendingTasks.unshift(task);
        }
      } catch (error) {
        logger.error('[Idle Work] Task failed:', error);
      } finally {
        runningTasks.delete(task.id);
        // Process next task
        if (pendingTasks.length > 0) {
          processIdleQueue();
        }
      }
    },
    { timeout: task.timeout }
  );
}

/**
 * Defer callback execution to idle time
 * Returns a promise that resolves when work is done
 */
export function runWhenIdle<T>(
  callback: () => T | Promise<T>,
  options: IdleWorkOptions = {}
): Promise<T> {
  return new Promise((resolve, reject) => {
    scheduleIdleWork(async () => {
      try {
        const result = await callback();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }, options);
  });
}

/**
 * Batch multiple callbacks into a single idle task
 */
export class IdleBatch {
  private callbacks: Array<() => void | Promise<void>> = [];
  private taskId: number | null = null;
  private options: IdleWorkOptions;

  constructor(options: IdleWorkOptions = {}) {
    this.options = options;
  }

  add(callback: () => void | Promise<void>): void {
    this.callbacks.push(callback);

    // Cancel previous task
    if (this.taskId !== null) {
      cancelIdleWork(this.taskId);
    }

    // Schedule new task
    this.taskId = scheduleIdleWork(async () => {
      const callbacks = [...this.callbacks];
      this.callbacks = [];
      this.taskId = null;

      for (const cb of callbacks) {
        await cb();
      }
    }, this.options);
  }

  flush(): void {
    if (this.taskId !== null) {
      cancelIdleWork(this.taskId);
      this.taskId = null;
    }

    const callbacks = [...this.callbacks];
    this.callbacks = [];

    callbacks.forEach(cb => cb());
  }

  clear(): void {
    if (this.taskId !== null) {
      cancelIdleWork(this.taskId);
      this.taskId = null;
    }
    this.callbacks = [];
  }
}

/**
 * Debounce function that runs during idle time
 */
export function idleDebounce<T extends (...args: unknown[]) => unknown>(
  callback: T,
  wait: number = 300,
  options: IdleWorkOptions = {}
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let taskId: number | null = null;

  return function (this: unknown, ...args: Parameters<T>) {
    // Clear previous timeout and task
    if (timeoutId) clearTimeout(timeoutId);
    if (taskId !== null) cancelIdleWork(taskId);

    timeoutId = setTimeout(() => {
      taskId = scheduleIdleWork(() => {
        callback.apply(this, args);
      }, options);
    }, wait);
  };
}

/**
 * Throttle function that runs during idle time
 */
export function idleThrottle<T extends (...args: unknown[]) => unknown>(
  callback: T,
  wait: number = 300,
  options: IdleWorkOptions = {}
): (...args: Parameters<T>) => void {
  let lastRun = 0;
  let taskId: number | null = null;

  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastRun >= wait) {
      lastRun = now;

      if (taskId !== null) cancelIdleWork(taskId);

      taskId = scheduleIdleWork(() => {
        callback.apply(this, args);
      }, options);
    }
  };
}

/**
 * Split heavy work into chunks
 */
export async function chunkWork<T>(
  items: T[],
  processFn: (item: T) => void | Promise<void>,
  chunkSize: number = 10,
  options: IdleWorkOptions = {}
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    await runWhenIdle(async () => {
      for (const item of chunk) {
        await processFn(item);
      }
    }, options);
  }
}

/**
 * Analytics and prefetch during idle time
 */
export function scheduleAnalytics(callback: () => void): void {
  scheduleIdleWork(callback, { priority: 'low', timeout: 10000 });
}

export function schedulePrefetch(callback: () => void): void {
  scheduleIdleWork(callback, { priority: 'medium', timeout: 3000 });
}

export function scheduleCleanup(callback: () => void): void {
  scheduleIdleWork(callback, { priority: 'low', timeout: 15000 });
}

/**
 * Get idle work stats
 */
export function getIdleWorkStats(): {
  pending: number;
  running: number;
  tasks: IdleTask[];
} {
  return {
    pending: pendingTasks.length,
    running: runningTasks.size,
    tasks: [...pendingTasks],
  };
}

/**
 * Clear all pending idle work
 */
export function clearAllIdleWork(): void {
  pendingTasks.length = 0;
  runningTasks.clear();
}

/**
 * Wait for all idle work to complete
 */
export async function waitForIdleWork(): Promise<void> {
  while (pendingTasks.length > 0 || runningTasks.size > 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Hook for scheduling work during idle time
 */
export function useIdleWork() {
  return {
    schedule: scheduleIdleWork,
    cancel: cancelIdleWork,
    runWhenIdle,
    scheduleAnalytics,
    schedulePrefetch,
    scheduleCleanup,
  };
}
