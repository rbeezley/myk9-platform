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
 * Importing this module installs the check. ES modules evaluate once, so the
 * install needs no flag and holds no mutable state. It is imported by
 * `lib/queryClient.ts` (so the app is covered wherever the client is) and by
 * `test/setup.ts` (so every unit test is).
 *
 * Development and test THROW, which is the loud failure the rule needs.
 * Production reports and continues: a hard throw here would take a whole page
 * down for an end user over a defect the developer should have hit first, and
 * production has a second line of defence either way —
 * `useClearQueryCacheOnAccountChange` empties the cache whenever the signed-in
 * identity changes, so an unscoped key cannot outlive the account that filled
 * it.
 */
import { QueryCache } from '@tanstack/react-query';
import { assertViewerScopedQueryKey, MissingViewerScopeError } from './viewerScopedQueryKey';

/**
 * Loaded only when a production build actually hits an unscoped key.
 *
 * Statically importing the logger and Sentry here would pull `@sentry/react`
 * into every test process through `test/setup.ts`, BEFORE a test file's own
 * `vi.mock('@sentry/react')` factory could be registered - which silently broke
 * four observability tests that mock it. A guard must not reshape the module
 * graph of the thing it guards.
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

const originalBuild = QueryCache.prototype.build;

function guardedBuild(
  this: QueryCache,
  ...args: Parameters<typeof originalBuild>
): ReturnType<typeof originalBuild> {
  const [, options] = args;
  try {
    assertViewerScopedQueryKey(options.queryKey);
  } catch (error) {
    if (!(error instanceof MissingViewerScopeError) || !import.meta.env.PROD) throw error;
    void reportUnscopedQueryKey(error, options.queryKey);
  }
  return originalBuild.apply(this, args);
}

QueryCache.prototype.build = guardedBuild as typeof originalBuild;
