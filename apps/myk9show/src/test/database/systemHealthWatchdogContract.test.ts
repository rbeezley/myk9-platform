import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const watchdogMigration = resolve(
  repoRoot,
  'supabase/migrations/20260711151000_daily_health_snapshot_watchdog.sql'
);
const healthCronMigration = resolve(
  repoRoot,
  'supabase/migrations/20260704140000_system_health_cron.sql'
);
const snapshotMigration = resolve(
  repoRoot,
  'supabase/migrations/20260704120000_create_system_health_snapshots.sql'
);
const operatorAlertsMigration = resolve(
  repoRoot,
  'supabase/migrations/20260709130000_create_operator_alerts.sql'
);

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim().toLowerCase();
const readWatchdogMigration = (): string => readFileSync(watchdogMigration, 'utf8');

function watchdogBody(sql: string): string {
  const match = sql.match(/\$health_watchdog\$([\s\S]*?)\$health_watchdog\$/i);
  expect(match, 'watchdog cron body').not.toBeNull();
  return normalize(match?.[1] ?? '');
}

function rollbackInstructions(sql: string): string {
  const match = sql.match(/-- Rollback \(run in a follow-up migration\):([\s\S]*?)\n\s*BEGIN;/i);
  expect(match, 'manual rollback section').not.toBeNull();
  return normalize((match?.[1] ?? '').replace(/^\s*-- ?/gm, ''));
}

describe('daily health snapshot watchdog migration', () => {
  it('runs one hour after the 07:00 UTC daily health dispatch', () => {
    const healthSql = normalize(readFileSync(healthCronMigration, 'utf8'));
    const watchdogSql = normalize(readWatchdogMigration());

    expect(healthSql).toContain("'daily-health-check', '0 7 * * *'");
    expect(watchdogSql).toContain("'daily-health-snapshot-watchdog', '0 8 * * *'");
  });

  it('uses only SQL and the existing descending snapshot timestamp index', () => {
    const body = watchdogBody(readWatchdogMigration());
    const snapshotSql = normalize(readFileSync(snapshotMigration, 'utf8'));

    expect(snapshotSql).toContain(
      'create index system_health_snapshots_created_at_desc_idx on public.system_health_snapshots (created_at desc)'
    );
    expect(body).toContain('from public.system_health_snapshots');
    expect(body).toContain("source = 'cron-health-check'");
    expect(body).toMatch(/order by (?:[a-z_]+\.)?created_at desc/);
    expect(body).toContain('limit 1');
    expect(body).not.toMatch(/pg_net|net\.http|vault|secret|functions\/v1/);
  });

  it('checks the expected 07:00-08:00 UTC snapshot window', () => {
    const body = watchdogBody(readWatchdogMigration());

    expect(body).toContain("date_trunc('day', now() at time zone 'utc') + interval '7 hours'");
    expect(body).toContain("date_trunc('day', now() at time zone 'utc') + interval '8 hours'");
    expect(body).toMatch(/created_at\s*>=\s*(?:[a-z_]+\.)?expected_at/);
    expect(body).toMatch(/created_at\s*<\s*(?:[a-z_]+\.)?deadline_at/);
  });

  it('writes the exact durable alert without duplicating an unresolved missed run', () => {
    const body = watchdogBody(readWatchdogMigration());

    expect(body).toMatch(
      /insert into public\.operator_alerts \(\s*source, severity, title, detail, dedupe_key\s*\)/
    );
    expect(body).toContain("'daily-health-snapshot-watchdog'");
    expect(body).toContain("'error'");
    expect(body).toContain("'daily health snapshot missing'");
    expect(body).toContain("'job_name', 'daily-health-check'");
    expect(body).toContain("'snapshot_source', 'cron-health-check'");
    expect(body).toContain("'expected_at'");
    expect(body).toContain("'deadline_at'");
    expect(body).toContain("'checked_at'");
    expect(body).toContain("'latest_snapshot_at'");
    expect(body).toMatch(
      /latest_snapshot as \([\s\S]*source = 'cron-health-check'[\s\S]*order by (?:[a-z_]+\.)?created_at desc[\s\S]*limit 1/
    );
    expect(body).toMatch(
      /'daily-health-check:' \|\| to_char\((?:[a-z_]+\.)?expected_at at time zone 'utc', 'yyyy-mm-dd'\)/
    );
    expect(body).toContain('where expected_window_snapshot.created_at is null');
    expect(body).toContain(
      'on conflict (source, dedupe_key) where resolved_at is null and dedupe_key is not null do nothing'
    );
  });

  it('documents exact rollback SQL and permits recurrence after resolution', () => {
    const rollback = rollbackInstructions(readWatchdogMigration());
    const alertsSql = normalize(readFileSync(operatorAlertsMigration, 'utf8'));

    expect(rollback).toContain(
      "select cron.unschedule(jobid) from cron.job where jobname = 'daily-health-snapshot-watchdog'"
    );
    expect(rollback).not.toContain('drop table');

    // The unresolved-only conflict target matches operator_alerts' partial unique
    // index. Resolving an alert removes it from that target, so a repeated missed
    // run can create a new durable incident instead of being suppressed forever.
    expect(alertsSql).toContain(
      'create unique index operator_alerts_source_dedupe_key_unresolved_idx on public.operator_alerts (source, dedupe_key) where resolved_at is null and dedupe_key is not null'
    );
    expect(watchdogBody(readWatchdogMigration())).toContain(
      'where resolved_at is null and dedupe_key is not null do nothing'
    );
  });
});
