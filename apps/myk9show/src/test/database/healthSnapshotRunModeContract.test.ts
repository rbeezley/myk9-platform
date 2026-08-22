import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const read = (file: string) => readFileSync(resolve(repoRoot, file), 'utf8');

const runModeMigration = read('supabase/migrations/20260822180000_health_snapshot_run_mode.sql');
const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

function watchdogBody(sql: string): string {
  const match = sql.match(/\$health_watchdog\$([\s\S]*?)\$health_watchdog\$/i);
  expect(match, 'watchdog cron body').not.toBeNull();
  return normalize(match?.[1] ?? '');
}

describe('QA-HEALTH-WATCHDOG-INERT-2026-08-22 run_mode discriminator', () => {
  it('adds a constrained, nullable run_mode column with no DEFAULT', () => {
    const sql = normalize(runModeMigration);
    expect(sql).toContain('add column if not exists run_mode text');
    expect(sql).toContain("check (run_mode is null or run_mode in ('continuous', 'full'))");
    // A DEFAULT would relabel continuous rows as full the moment the function
    // stopped sending the value -- the exact silent-inertness this fixes.
    expect(sql).not.toMatch(/add column if not exists run_mode text\s+default/);
  });

  it('rescopes BOTH watchdog snapshot lookups, not just the window one', () => {
    const body = watchdogBody(runModeMigration);
    // `latest_snapshot` only feeds the alert detail, but if it still counted
    // continuous rows the alert would report a reassuring recent timestamp
    // while claiming the nightly run is missing.
    expect(body.match(/run_mode is distinct from 'continuous'/g)).toHaveLength(2);
    expect(body).toContain('expected_window_snapshot');
    expect(body).toContain('latest_snapshot');
  });

  it("uses IS DISTINCT FROM rather than = 'full', so a pre-deploy NULL still counts", () => {
    const body = watchdogBody(runModeMigration);
    // Ordering safety: this migration may land before the function deploy that
    // starts populating run_mode. Under `run_mode = 'full'` every row in that
    // gap is NULL, the predicate finds nothing, and the watchdog fires a false
    // "snapshot missing" alert at the next 08:00.
    expect(body).not.toContain("run_mode = 'full'");
    expect(body).toContain('run_mode is distinct from');
  });

  it('preserves the dedupe key and conflict guard the original watchdog relied on', () => {
    const body = watchdogBody(runModeMigration);
    expect(body).toContain("'daily-health-check:' || to_char(run_window.expected_at at time zone 'utc', 'yyyy-mm-dd')");
    expect(body).toContain('on conflict (source, dedupe_key)');
    expect(body).toContain('where resolved_at is null and dedupe_key is not null');
    expect(body).toContain('do nothing');
  });

  it('keeps the 08:00 schedule and unschedules the old job first', () => {
    const sql = normalize(runModeMigration);
    expect(sql).toContain("where jobname = 'daily-health-snapshot-watchdog'");
    expect(sql).toContain("'daily-health-snapshot-watchdog', '0 8 * * *'");
    expect(sql.indexOf('cron.unschedule')).toBeLessThan(sql.indexOf('cron.schedule'));
  });

  it('has the edge function persist run_mode on every snapshot insert', () => {
    const index = read('apps/myk9show/supabase/functions/cron-health-check/index.ts');
    expect(index).toContain('run_mode: runMode');
    // Both the healthy path and the probe-failure path must write it; a probe
    // failure still proves the nightly run happened.
    const calls = index.match(/await insertSnapshot\(snapshot, mode\);/g);
    expect(calls).toHaveLength(2);
    expect(index).not.toMatch(/await insertSnapshot\(snapshot\);/);
  });
});
