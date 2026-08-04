import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const source = readFileSync(
  resolve(repoRoot, 'apps/myk9show/supabase/functions/cron-health-check/index.ts'),
  'utf8'
);

describe('cron-health-check Sentry Cron source contract', () => {
  it('keeps one snapshot construction in the probe-failure branch', () => {
    const branchStart = source.indexOf('if (probeError || facts == null)');
    const insertStart = source.indexOf('await insertSnapshot(snapshot);', branchStart);
    const failureBranch = source.slice(branchStart, insertStart);

    expect(failureBranch.match(/\bconst snapshot\b/g)).toHaveLength(1);
  });

  it('parses as a TypeScript Edge Function entrypoint', () => {
    const result = spawnSync(
      process.execPath,
      [
        '--experimental-strip-types',
        '--check',
        resolve(repoRoot, 'apps/myk9show/supabase/functions/cron-health-check/index.ts'),
      ],
      { encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(0);
  });

  it('uses the official Deno SDK and the shared best-effort seam', () => {
    expect(source).toContain("from 'npm:@sentry/deno@10.62.0'");
    expect(source).toContain("from '../_shared/sentryCronCheckIn.ts'");
    expect(source).toContain('runWithBestEffortCronCheckIn(');
    expect(source).toContain('DAILY_HEALTH_MONITOR_SLUG');
  });

  it('keeps the Edge DSN optional and never reads the browser DSN', () => {
    expect(source).toContain("Deno.env.get('SENTRY_DSN')");
    expect(source).not.toContain('VITE_SENTRY_DSN');

    const requiredEnvironmentGuard = source.match(
      /if \(!supabaseUrl \|\| !supabaseServiceKey \|\| !cronSecret\)[\s\S]*?\}/
    )?.[0];
    expect(requiredEnvironmentGuard).toBeDefined();
    expect(requiredEnvironmentGuard).not.toContain('sentry');
  });

  it('starts monitoring only after method and secret authentication', () => {
    const methodCheck = source.indexOf("req.method !== 'POST'");
    const secretCheck = source.indexOf("req.headers.get('x-function-secret')");
    const monitoredRun = source.indexOf('runWithBestEffortCronCheckIn(');

    expect(methodCheck).toBeGreaterThan(-1);
    expect(secretCheck).toBeGreaterThan(methodCheck);
    expect(monitoredRun).toBeGreaterThan(secretCheck);
  });

  it('does not mutate externally managed Sentry monitor configuration', () => {
    expect(source).not.toMatch(/monitorConfig|upsertMonitor|schedule:\s*\{/);
  });
});
