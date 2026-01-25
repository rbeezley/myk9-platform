/**
 * Native debounce implementation with cancel support
 * Replaces lodash debounce to reduce bundle size (~50KB savings)
 */

export interface DebouncedFunction<T extends (...args: unknown[]) => unknown> {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
}

/**
 * Creates a debounced function that delays invoking `fn` until after `wait`
 * milliseconds have elapsed since the last time the debounced function was invoked.
 *
 * @param fn - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @returns A debounced function with cancel() and flush() methods
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>): void => {
    lastArgs = args;

    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }, wait);
  };

  debounced.cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }
  };

  return debounced;
}
