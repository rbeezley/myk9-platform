// How one `cron-health-check` invocation identifies itself, in one place.
//
// The header names here are the SAME STRINGS the pg_cron job bodies send in
// `supabase/migrations/20260804161000_continuous_health_checks_and_run_now.sql`.
// They live in a SQL string on one side and a `.ts` file on the other, and no
// compiler relates the two — so `continuousHealthCheckContract.test.ts` asserts
// the migration contains exactly these constants. Rename one without the other
// and every run silently reads as the nightly full run again.

import type { HealthCheckRunMode } from '../../../src/features/admin-system-health/healthCheckCadence.ts';

export const HEALTH_CHECK_MODE_HEADER = 'x-health-check-mode';
export const HEALTH_RUN_TOKEN_HEADER = 'x-health-run-token';

/** The `0 7 * * *` nightly full run. Also the manual `Run now` full run: that
 * one is how an operator CLEARS a missed-nightly page from inside the product,
 * so it must reach the same monitor. */
export const DAILY_HEALTH_MONITOR_SLUG = 'daily-health-check';

/** The every-5-minutes continuous run. A separate monitor rather than no monitor:
 * the check-in is the only path in this function that reaches a human — there is
 * no `captureException`, `pg_net` discards the response body, and pg_cron records
 * the job `succeeded` regardless — so folding continuous runs into the daily
 * monitor made one transient blip page (2026-08-22), while dropping them
 * entirely would have hidden a total continuous outage for ~24h. Set this
 * monitor's failure tolerance ABOVE 1 in the Sentry console; that is what makes
 * a single self-healing blip quiet and a sustained failure loud. */
export const CONTINUOUS_HEALTH_MONITOR_SLUG = 'continuous-health-check';

export type HealthCheckRun = {
  mode: HealthCheckRunMode;
  runToken: string | null;
  monitorSlug: string;
};

/**
 * Resolve a request into the run it represents and the Sentry Cron monitor that
 * run reports to.
 *
 * INTENT: every invocation reports to EXACTLY ONE monitor, chosen here. The
 * caller has no branch to take, so there is no "gate that forgot to return" —
 * the previous shape of this fix had one, and a mutation proving it broken kept
 * the whole suite green.
 */
export function resolveHealthCheckRun(headers: Headers): HealthCheckRun {
  const mode: HealthCheckRunMode =
    headers.get(HEALTH_CHECK_MODE_HEADER) === 'continuous' ? 'continuous' : 'full';

  return {
    mode,
    runToken: headers.get(HEALTH_RUN_TOKEN_HEADER),
    monitorSlug:
      mode === 'continuous' ? CONTINUOUS_HEALTH_MONITOR_SLUG : DAILY_HEALTH_MONITOR_SLUG,
  };
}
