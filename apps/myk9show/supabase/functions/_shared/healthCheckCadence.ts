/**
 * The single source for how often each health check is expected to be refreshed.
 * A check is stale after two missed intervals; the runner persists that value
 * with the result so the board does not need a second, drifting threshold table.
 *
 * It lives in the functions tree and the app imports it from here, never the
 * other way round (MYK9-729): a function that imports app `src/` deploys a
 * bundle `supabase functions download` refuses to extract, so
 * `qa:edge-function-drift --content` could never check cron-health-check.
 * `scripts/qa/edge-function-imports.test.ts` keeps every function in-tree.
 */

export const HEALTH_CHECK_INTERVAL_MS = {
  payout_cron: 5 * 60 * 1000,
  payout_ledger: 5 * 60 * 1000,
  background_jobs: 5 * 60 * 1000,
  migrations: 5 * 60 * 1000,
  ringside_conflicts: 5 * 60 * 1000,
  // MYK9-136. A single indexed join over `people`, cheap enough for the
  // continuous path — and worth being there: the invariant is enforced by a
  // trigger, so any non-zero reading means something reached the table by a
  // route that bypassed it, which is exactly the case you want to hear about
  // quickly rather than at the next nightly.
  sign_in_email_drift: 5 * 60 * 1000,
  anon_grants: 24 * 60 * 60 * 1000,
  applied_acl_grants: 24 * 60 * 60 * 1000,
  public_schema_create_acl: 24 * 60 * 60 * 1000,
  // MYK9-741. Test-named shows published on the live listing; nightly is
  // plenty for a row someone seeded by hand.
  stray_published_shows: 24 * 60 * 60 * 1000,
  // MYK9-737. One indexed read of private.class_results_push; its retry cron
  // runs every five minutes, so the check keeps the same pace.
  class_results_push: 5 * 60 * 1000,
  // MYK9-781. One primary-key count; checkout and the entry wizard fail
  // closed the moment the row is gone, so every run reads it.
  platform_settings_singleton: 5 * 60 * 1000,
} as const;

/** Expected source-job windows used to judge whether a scheduled job is late.
 * These are not board freshness windows: the cron metadata itself is refreshed
 * every five minutes, while the payout job is expected once per day. */
const HEALTH_CHECK_SOURCE_INTERVAL_MS = {
  payout_cron: 13 * 60 * 60 * 1000,
  background_jobs: 13 * 60 * 60 * 1000,
} as const;

export type HealthCheckKey = keyof typeof HEALTH_CHECK_INTERVAL_MS;
export type HealthCheckRunMode = 'continuous' | 'full';

/** Compatibility window for snapshots written before MYK9-157. */
export const LEGACY_HEALTH_CHECK_STALE_AFTER_MS = 26 * 60 * 60 * 1000;

export const CONTINUOUS_HEALTH_CHECK_KEYS: readonly HealthCheckKey[] = [
  'payout_cron',
  'payout_ledger',
  'background_jobs',
  'migrations',
  'ringside_conflicts',
  'sign_in_email_drift',
  'class_results_push',
  'platform_settings_singleton',
];

export function isHealthCheckKey(value: string): value is HealthCheckKey {
  return value in HEALTH_CHECK_INTERVAL_MS;
}

export function healthCheckStaleAfterMs(key: string): number {
  return isHealthCheckKey(key)
    ? HEALTH_CHECK_INTERVAL_MS[key] * 2
    : LEGACY_HEALTH_CHECK_STALE_AFTER_MS;
}

export function healthCheckSourceStaleAfterMs(key: string): number {
  return key in HEALTH_CHECK_SOURCE_INTERVAL_MS
    ? HEALTH_CHECK_SOURCE_INTERVAL_MS[key as keyof typeof HEALTH_CHECK_SOURCE_INTERVAL_MS] * 2
    : healthCheckStaleAfterMs(key);
}

export function shouldRunHealthCheck(key: string, mode: HealthCheckRunMode): boolean {
  return mode === 'full' || CONTINUOUS_HEALTH_CHECK_KEYS.includes(key as HealthCheckKey);
}
