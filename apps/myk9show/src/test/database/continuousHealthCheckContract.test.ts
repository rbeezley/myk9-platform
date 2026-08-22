import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = resolve(
  process.cwd(),
  '../../supabase/migrations/20260804161000_continuous_health_checks_and_run_now.sql'
);

describe('MYK9-157 continuous health migration contract', () => {
  const source = readFileSync(migration, 'utf8').toLowerCase();

  it('keeps the expensive probe path out of continuous runs', () => {
    expect(source).toContain('system_health_probe(p_include_expensive boolean)');
    expect(source).toContain('if p_include_expensive then');
    expect(source).toContain("'x-health-check-mode', 'continuous'");
  });

  it('gates Run now in a security-definer RPC and grants only authenticated access', () => {
    expect(source).toContain('create or replace function public.run_system_health_check_now()');
    expect(source).toContain('if not public.is_site_admin() then');
    expect(source).toContain(
      'revoke all on function public.run_system_health_check_now() from anon'
    );
    expect(source).toContain(
      'grant execute on function public.run_system_health_check_now() to authenticated'
    );
    expect(source).toContain("url := edge_function_base_url || '/cron-health-check'");
    expect(source).toContain("'x-health-run-token', run_token::text");
    expect(source).toContain("'run_token', run_token");
  });

  it('reports to the Sentry Cron monitor only from the nightly full run', () => {
    const index = readFileSync(
      resolve(process.cwd(), 'supabase/functions/cron-health-check/index.ts'),
      'utf8'
    );
    // The gate must short-circuit BEFORE runWithBestEffortCronCheckIn, or the
    // 5-minute job keeps filing check-ins against a `0 7 * * *` monitor.
    const gate = index.indexOf('if (!isDailyMonitorRun(mode, runToken))');
    const checkIn = index.indexOf('runWithBestEffortCronCheckIn(sentryCronClient');
    expect(gate).toBeGreaterThan(-1);
    expect(checkIn).toBeGreaterThan(gate);
  });

  it('schedules both five-minute continuous and nightly full dispatches', () => {
    expect(source).toContain("'continuous-health-check'");
    expect(source).toContain("'*/5 * * * *'");
    expect(source).toContain("'daily-health-check'");
    expect(source).toContain("'0 7 * * *'");
    expect(source).toContain("'x-health-check-mode', 'full'");
  });
});
