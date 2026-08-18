import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(__dirname, 'index.ts'), 'utf8');

describe('sentry-dashboard-metrics edge function source contract', () => {
  it('requires a caller JWT and applies the myK9Show CORS policy', () => {
    expect(source).toContain(
      "handle<Record<string, never>>({ auth: 'jwt', origins: MYK9SHOW_ORIGINS }"
    );
  });

  it('reads only server-side Sentry configuration', () => {
    expect(source).toContain("Deno.env.get('SENTRY_API_TOKEN')");
    expect(source).toContain("Deno.env.get('SENTRY_ORGANIZATION_SLUG')");
    expect(source).not.toContain('VITE_SENTRY');
  });

  it('keeps the cache in the edge isolate and delegates metric handling', () => {
    expect(source).toContain('const cache: SentryMetricCache = new Map()');
    expect(source).toContain('createSentryDashboardMetricsHandler(ctx, deps)');
  });
});
