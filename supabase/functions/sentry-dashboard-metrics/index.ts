import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import {
  createSentryDashboardMetricsHandler,
  type SentryMetricCache,
  type SentryDashboardMetricsDeps,
} from './metrics.ts';

const cache: SentryMetricCache = new Map();

handle<Record<string, never>>({ auth: 'jwt', origins: MYK9SHOW_ORIGINS }, async ctx => {
  const deps: SentryDashboardMetricsDeps = {
    apiToken: Deno.env.get('SENTRY_API_TOKEN'),
    organization: Deno.env.get('SENTRY_ORGANIZATION_SLUG'),
    fetch,
    now: Date.now,
    cache,
  };

  return createSentryDashboardMetricsHandler(ctx, deps);
});
