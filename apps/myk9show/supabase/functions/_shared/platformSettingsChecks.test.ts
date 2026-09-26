// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  platformSettingsSingletonCheck,
  readPlatformSettingsRowCount,
} from './platformSettingsChecks';
import { buildSnapshot } from './systemHealthChecks';
import { shouldRunHealthCheck } from './healthCheckCadence';

/**
 * MYK9-781. The platform_settings singleton vanished on production and nothing
 * said so until an exhibitor hit the wizard. The check is red unless the table
 * holds exactly one row, and red again when it cannot tell: a runner that could
 * not read the row has not proved the row exists.
 */

const AT = '2026-09-26T01:00:00.000Z';

describe('platformSettingsSingletonCheck', () => {
  it('is ok with exactly one row', () => {
    expect(platformSettingsSingletonCheck({ count: 1 }, AT)).toEqual({
      key: 'platform_settings_singleton',
      label: 'Platform settings row',
      status: 'ok',
      detail: 'platform_settings holds its one row',
      checked_at: AT,
      counter_value: 1,
    });
  });

  it('fails, naming what breaks, when the row is missing (the MYK9-781 incident)', () => {
    const check = platformSettingsSingletonCheck({ count: 0 }, AT);
    expect(check.status).toBe('fail');
    expect(check.counter_value).toBe(0);
    expect(check.detail).toBe(
      'platform_settings has no row: checkout, the entry wizard and the show publish gate cannot read the platform fee or Stripe mode'
    );
  });

  it('fails on more than one row', () => {
    const check = platformSettingsSingletonCheck({ count: 2 }, AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toBe('platform_settings holds 2 rows; it must hold exactly one');
  });

  it.each([
    [
      'a read error',
      { error: 'permission denied for table platform_settings' },
      /could not read platform_settings: permission denied/,
    ],
    ['no facts at all', undefined, /was not reported/],
    ['a null count', { count: null }, /unreadable row count/],
    ['a fractional count', { count: 0.5 }, /unreadable row count/],
    ['a string count', { count: '1' }, /unreadable row count/],
  ])('fails, never ok, on %s', (_label, facts, detail) => {
    const check = platformSettingsSingletonCheck(facts, AT);
    expect(check.status).toBe('fail');
    expect(check.detail).toMatch(detail);
  });
});

describe('readPlatformSettingsRowCount', () => {
  it('passes the exact count through', async () => {
    expect(await readPlatformSettingsRowCount(async () => ({ count: 0, error: null }))).toEqual({
      count: 0,
    });
  });

  it('reports a query error as an error, not as zero rows', async () => {
    expect(
      await readPlatformSettingsRowCount(async () => ({ count: null, error: { message: 'boom' } }))
    ).toEqual({ error: 'boom' });
  });

  it('reports a thrown fetch as an error', async () => {
    expect(
      await readPlatformSettingsRowCount(async () => {
        throw new Error('network down');
      })
    ).toEqual({ error: 'network down' });
  });
});

describe('platform_settings_singleton in the snapshot', () => {
  it('runs on every continuous run, not only the nightly one', () => {
    expect(shouldRunHealthCheck('platform_settings_singleton', 'continuous')).toBe(true);
  });

  it('turns the whole snapshot red when the row is missing', () => {
    const snapshot = buildSnapshot(
      { probed_at: AT, platform_settings_singleton: { count: 0 } },
      { now: Date.parse(AT), mode: 'continuous' }
    );
    expect(snapshot.checks.find(c => c.key === 'platform_settings_singleton')).toMatchObject({
      status: 'fail',
      stale_after_ms: 10 * 60 * 1000,
    });
    expect(snapshot.overall_status).toBe('fail');
  });
});
