/**
 * Makes a forgotten viewer scope FAIL, rather than leak (MYK9-429 AC3).
 *
 * A convention documented in a comment is worth nothing: the next hook to add
 * an `['exhibitor', ...]` key is written by someone who never read this file,
 * and prose about a rule is indistinguishable from the rule to every checker we
 * have. So the check runs, on every key, at the moment React Query builds it.
 *
 * `QueryCache.prototype.build` is the single funnel every query passes through
 * — `useQuery`, `prefetchQuery`, `setQueryData`, `ensureQueryData` all reach it,
 * on EVERY QueryClient, including the ad-hoc ones tests construct. Subscribing
 * to the app's own cache instead would check only the singleton, which is
 * exactly the client no unit test uses; a new unscoped key would then ship
 * green. Patching the one shared entry point is what makes a missing scope a
 * failure in the suite as well as in the browser.
 *
 * Importing this module installs the check. It is imported by
 * `lib/queryClient.ts` (so the app is covered wherever the client is) and by
 * `test/setup.ts` (so every unit test is). The install is IDEMPOTENT rather
 * than relying on ES modules evaluating once: a module can be evaluated twice
 * within one process whenever it is reachable through two graphs — a duplicate
 * copy under a different resolved path, a `vi.resetModules()`, a mixed
 * bundled/externalised dependency — and a second naive wrap would capture the
 * first wrapper as its "original", stacking the check and re-entering the
 * report path once per layer. The marker below makes a second install a no-op.
 *
 * Development and test THROW, which is the loud failure the rule needs.
 * Production reports and continues: a hard throw here would take a whole page
 * down for an end user over a defect the developer should have hit first, and
 * production has a second line of defence either way —
 * `useClearQueryCacheOnAccountChange` empties the cache whenever the signed-in
 * identity changes, so an unscoped key cannot outlive the account that filled
 * it. That promise is unconditional: in a production build this wrapper
 * swallows EVERY error the check can raise, not only the one it expects. A
 * guard that is itself the reason a page went blank is worse than the leak it
 * was watching for, and `build` runs inside render.
 */
import { QueryCache } from '@tanstack/react-query';
import { assertViewerScopedQueryKey, MissingViewerScopeError } from './viewerScopedQueryKey';

/**
 * Loaded only when a production build actually hits an unscoped key.
 *
 * Statically importing the logger and Sentry here would pull `@sentry/react`
 * into every test process through `test/setup.ts`, BEFORE a test file's own
 * `vi.mock('@sentry/react')` factory could be registered - which silently broke
 * six assertions across `services/observability/sentry.test.ts` and
 * `features/financial/reconciliationFailureReporting.test.ts` (verified by
 * making the imports static and re-running them). A guard must not reshape the
 * module graph of the thing it guards.
 */
async function reportUnscopedQueryKey(
  error: MissingViewerScopeError,
  queryKey: readonly unknown[]
): Promise<void> {
  const [{ logger }, { captureMonitoredQueryFailure }] = await Promise.all([
    import('@/services/LoggingService'),
    import('@/services/observability/sentry'),
  ]);
  logger.error('Unscoped viewer query key', 'query', { queryKey }, error);
  captureMonitoredQueryFailure(error, queryKey);
}

/**
 * Marks an already-installed wrapper. `Symbol.for` rather than a local symbol
 * on purpose: a second copy of this module holds a different local symbol and
 * would not recognise the first copy's wrapper, which is the whole case the
 * marker exists to cover.
 */
const VIEWER_SCOPE_GUARD_INSTALLED = Symbol.for('myk9.viewerScopeGuard.installed');

type BuildFn = typeof QueryCache.prototype.build;
type GuardedBuildFn = BuildFn & { [VIEWER_SCOPE_GUARD_INSTALLED]?: true };

/** True when some copy of this module has already wrapped `build`. */
export function isViewerScopeGuardInstalled(): boolean {
  return (QueryCache.prototype.build as GuardedBuildFn)[VIEWER_SCOPE_GUARD_INSTALLED] === true;
}

/** Installs the check, or does nothing if it is already installed. */
export function installViewerScopeGuard(): void {
  if (isViewerScopeGuardInstalled()) return;

  const originalBuild = QueryCache.prototype.build;

  const guardedBuild = function guardedBuild(
    this: QueryCache,
    ...args: Parameters<BuildFn>
  ): ReturnType<BuildFn> {
    const [, options] = args;
    try {
      assertViewerScopedQueryKey(options.queryKey);
    } catch (error) {
      // Dev and test rethrow EVERYTHING, including a bug in the check itself:
      // a guard failing silently in the one environment that could act on it
      // is the failure mode this module exists to rule out.
      if (!import.meta.env.PROD) throw error;
      if (error instanceof MissingViewerScopeError) {
        // `.catch` and not just `void`: this chunk is fetched for the first
        // time at the moment of the failure, so a stale-deploy 404 here is
        // more likely than anywhere else in the app, and an unhandled
        // rejection would report the guard instead of the defect.
        void reportUnscopedQueryKey(error, options.queryKey).catch(() => {});
      }
    }
    return originalBuild.apply(this, args);
  } as GuardedBuildFn;

  guardedBuild[VIEWER_SCOPE_GUARD_INSTALLED] = true;
  QueryCache.prototype.build = guardedBuild as BuildFn;
}

installViewerScopeGuard();
