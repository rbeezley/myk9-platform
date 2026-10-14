/**
 * lazyWithRetry - route-level React.lazy that survives a transient chunk-load failure.
 *
 * Why: React.lazy caches the FIRST import promise. If a navigation or flaky wifi aborts the
 * module graph, that rejected promise is cached forever and every re-render re-throws it, so
 * the boundary's "Try Again" could never recover (only a full reload did).
 *
 * Mechanism:
 *  1. The factory retries the import (a NEW `import()` call each time) with a short backoff
 *     before it lets the rejection reach React.
 *  2. If every attempt fails, the lazy is marked failed. `resetFailedLazyRoutes()` (called by
 *     LoadingErrorBoundary's "Try Again") swaps each failed lazy for a fresh one, so the next
 *     mount runs the factory (and its retries) again instead of re-throwing the cached error.
 *     The exported component is a stable wrapper that reads the current inner lazy at render.
 */
import { lazy, createElement, type ComponentProps, type ComponentType } from 'react';
import { recoverFromChunkLoadError } from '@/utils/chunkLoadRecovery';

/** How long a started recovery reload may take before the boundary shows instead. */
export const RELOAD_FALLBACK_MS = 5_000;

/** Delays before retry 1 and retry 2; total import attempts = RETRY_DELAYS_MS.length + 1. */
export const RETRY_DELAYS_MS = [300, 1000] as const;

const resetters = new Set<() => void>();

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function importWithRetry<M>(factory: () => Promise<M>): Promise<M> {
  for (const delay of RETRY_DELAYS_MS) {
    try {
      return await factory();
    } catch {
      await wait(delay);
    }
  }
  return factory();
}

/**
 * A lazy component whose terminal failure is recoverable: `load` runs again after
 * `resetFailedLazyRoutes()`. `load` owns any retry/backoff and must start a NEW attempt
 * on every call. Shared by lazyWithRetry and createEnhancedLazy.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic component wrapper
export function createResettableLazy<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>
): ComponentType<ComponentProps<T>> {
  let failed = false;

  const create = () =>
    lazy(() =>
      load().catch(error => {
        failed = true;
        // A failed import stays failed for this document (see chunkLoadRecovery). When a guarded
        // reload starts, stay suspended so the boundary never flashes before the page reloads.
        if (recoverFromChunkLoadError(error)) {
          // If the reload never happens (blocked, or cancelled at a leave prompt), fall back to
          // the boundary rather than a spinner that never ends.
          return new Promise<never>((_, reject) => {
            setTimeout(() => reject(error), RELOAD_FALLBACK_MS);
          });
        }
        throw error;
      })
    );

  let Inner = create();
  resetters.add(() => {
    if (!failed) return;
    failed = false;
    Inner = create();
  });

  const Wrapper = (props: ComponentProps<T>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- props forwarded verbatim
    createElement(Inner as ComponentType<any>, props);
  return Wrapper;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic component wrapper
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): ComponentType<ComponentProps<T>> {
  return createResettableLazy(() => importWithRetry(factory));
}

/** Give every lazy route whose import failed a fresh import on its next mount. */
export function resetFailedLazyRoutes(): void {
  resetters.forEach(reset => reset());
}
