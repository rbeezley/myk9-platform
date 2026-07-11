import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const source = readFileSync(
  resolve(repoRoot, 'apps/myk9show/supabase/functions/cron-health-check/index.ts'),
  'utf8'
);

describe('cron-health-check Sentry Cron source contract', () => {
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
