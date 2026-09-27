/**
 * MYK9-781: the `public.platform_settings` singleton must exist.
 *
 * On 2026-09-26 its one row (platform fee percent, flat and floor,
 * stripe_livemode) was found missing on production. Every reader fails closed
 * without it: stripe-checkout, the exhibitor entry wizard
 * (`fetchStripeLivemode`) and `enforce_show_publish_gate()`. Nothing reported
 * the absence; an exhibitor found it. Migration 20260926025100 now refuses
 * DELETE and TRUNCATE for every role; this check is the alarm for anything
 * that gets past it anyway.
 *
 * The check is `fail` unless the table holds exactly one row. A runner that
 * could not count the rows is also `fail`, not an unprovable `warn`: the same
 * service-role read is what checkout depends on, so being unable to make it is
 * itself the outage.
 *
 * Deno-free and side-effect free, like its `systemHealthChecks.ts` siblings;
 * cron-health-check does the query on every run (one primary-key count).
 */

import type { SnapshotCheck } from './systemHealthChecks.ts';

export const PLATFORM_SETTINGS_SINGLETON_KEY = 'platform_settings_singleton';
const LABEL = 'Platform settings row';

/** What a PostgREST `select('id', { count: 'exact', head: true })` resolves to. */
export type PlatformSettingsCountFetcher = () => PromiseLike<{
  count: number | null;
  error: { message: string } | null;
}>;

/** `{ count }` or `{ error }` for the check. Never throws. */
export async function readPlatformSettingsRowCount(
  fetchCount: PlatformSettingsCountFetcher
): Promise<{ count: number | null } | { error: string }> {
  try {
    const { count, error } = await fetchCount();
    return error ? { error: error.message } : { count };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * `raw` is `{ count }` from `readPlatformSettingsRowCount`, `{ error }` when
 * the read failed, or undefined when the runner did not report it.
 */
export function platformSettingsSingletonCheck(raw: unknown, checkedAt: string): SnapshotCheck {
  const base = { key: PLATFORM_SETTINGS_SINGLETON_KEY, label: LABEL, checked_at: checkedAt };

  if (!raw || typeof raw !== 'object') {
    return { ...base, status: 'fail', detail: 'the platform_settings row count was not reported' };
  }
  const facts = raw as Record<string, unknown>;
  if (typeof facts.error === 'string') {
    return {
      ...base,
      status: 'fail',
      detail: `could not read platform_settings: ${facts.error}`,
    };
  }
  const count = facts.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
    return {
      ...base,
      status: 'fail',
      detail: 'platform_settings returned an unreadable row count',
    };
  }
  if (count === 0) {
    return {
      ...base,
      status: 'fail',
      detail:
        'platform_settings has no row: checkout, the entry wizard and the show publish gate cannot read the platform fee or Stripe mode',
      counter_value: 0,
    };
  }
  if (count > 1) {
    return {
      ...base,
      status: 'fail',
      detail: `platform_settings holds ${count} rows; it must hold exactly one`,
      counter_value: count,
    };
  }
  return {
    ...base,
    status: 'ok',
    detail: 'platform_settings holds its one row',
    counter_value: 1,
  };
}
