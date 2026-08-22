import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  HEALTH_CHECK_MODE_HEADER,
  HEALTH_RUN_TOKEN_HEADER,
} from '../../../supabase/functions/_shared/healthCheckRun';

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

  // The header names are duplicated across a .sql string and a .ts module that no
  // compiler relates. healthCheckRun.test.ts pins the TypeScript side; these two
  // pin the SQL side against the same exported constants.
  it('sends the mode header the edge function actually reads', () => {
    const raw = readFileSync(migration, 'utf8');
    expect(raw).toContain(`'${HEALTH_CHECK_MODE_HEADER}', 'continuous'`);
    expect(raw).toContain(`'${HEALTH_CHECK_MODE_HEADER}', 'full'`);
    expect(raw).toContain(`'${HEALTH_RUN_TOKEN_HEADER}', run_token::text`);
  });

  it('leaves the nightly dispatch free of a run token', () => {
    // A run token on the 07:00 block would be a natural "add traceability"
    // change; it would also make the nightly run look manual. Slice the daily
    // job body specifically -- a whole-file toContain is satisfied by the
    // Run-now RPC alone and proves nothing about this block.
    const raw = readFileSync(migration, 'utf8');
    const parts = raw.split('$daily_health_check$');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    const dailyBody = parts[1];
    expect(dailyBody).toContain(`'${HEALTH_CHECK_MODE_HEADER}', 'full'`);
    expect(dailyBody).not.toContain(HEALTH_RUN_TOKEN_HEADER);
  });

  it('schedules both five-minute continuous and nightly full dispatches', () => {
    expect(source).toContain("'continuous-health-check'");
    expect(source).toContain("'*/5 * * * *'");
    expect(source).toContain("'daily-health-check'");
    expect(source).toContain("'0 7 * * *'");
    expect(source).toContain("'x-health-check-mode', 'full'");
  });
});
