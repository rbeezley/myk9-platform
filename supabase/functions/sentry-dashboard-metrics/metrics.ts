import type { HandlerCtx } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity, rolesInclude } from '../_shared/roleValidity.ts';

export const CACHE_TTL_MS = 60_000;
const SENTRY_API_BASE_URL = 'https://sentry.io/api/0/organizations';
const SENTRY_QUERY_WINDOW = '24h';

type MetricKey = 'errorRate' | 'apiP95';
type MetricStatus = 'fresh' | 'stale' | 'unavailable';

interface SentryTimeSeriesValue {
  timestamp?: number;
  value?: number | null;
  incomplete?: boolean;
}

interface SentryTimeSeriesResponse {
  timeSeries?: Array<{ values?: SentryTimeSeriesValue[] }>;
}

interface SentrySessionsResponse {
  end?: string;
  intervals?: string[];
  groups?: Array<{
    totals?: Record<string, number | null>;
    series?: Record<string, Array<number | null>>;
  }>;
}

export interface CachedMetric {
  value: number;
  observedAt: string;
  fetchedAt: number;
}

export type SentryMetricCache = Map<MetricKey, CachedMetric>;

export interface SentryMetricResult {
  value: number | null;
  unit: 'percent' | 'milliseconds';
  status: MetricStatus;
  observedAt: string | null;
  error?: 'Sentry metric unavailable';
}

export interface SentryDashboardMetricsResponse {
  generatedAt: string;
  window: typeof SENTRY_QUERY_WINDOW;
  errorRate: SentryMetricResult;
  apiP95: SentryMetricResult;
}

export interface SentryDashboardMetricsDeps {
  apiToken: string | undefined;
  organization: string | undefined;
  fetch: typeof fetch;
  now: () => number;
  cache: SentryMetricCache;
}

const METRIC_CONFIG: Record<
  MetricKey,
  { path: string; params: Array<[string, string]>; unit: SentryMetricResult['unit'] }
> = {
  errorRate: {
    path: 'sessions',
    params: [
      ['field', 'crash_rate(session)'],
      ['statsPeriod', SENTRY_QUERY_WINDOW],
      ['interval', '1h'],
    ],
    unit: 'percent',
  },
  apiP95: {
    path: 'events-timeseries',
    params: [
      ['dataset', 'spans'],
      ['statsPeriod', SENTRY_QUERY_WINDOW],
      ['interval', '3600'],
      ['yAxis', 'p95(transaction.duration)'],
    ],
    unit: 'milliseconds',
  },
};

function buildSentryMetricUrl(organization: string, key: MetricKey): string {
  const config = METRIC_CONFIG[key];
  const url = new URL(`${SENTRY_API_BASE_URL}/${encodeURIComponent(organization)}/${config.path}/`);
  for (const [name, value] of config.params) url.searchParams.set(name, value);
  return url.toString();
}

function parseObservedAt(timestamp: number): string {
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid Sentry metric timestamp');
  return date.toISOString();
}

function parseTimeseriesMetricResponse(payload: SentryTimeSeriesResponse): {
  value: number;
  observedAt: string;
} {
  const values = (payload.timeSeries ?? []).flatMap(series => series.values ?? []);

  for (const point of [...values].reverse()) {
    if (
      point.incomplete !== true &&
      typeof point.value === 'number' &&
      Number.isFinite(point.value) &&
      typeof point.timestamp === 'number'
    ) {
      return { value: point.value, observedAt: parseObservedAt(point.timestamp) };
    }
  }

  throw new Error('Sentry returned no complete metric value');
}

function parseSessionsMetricResponse(payload: SentrySessionsResponse): {
  value: number;
  observedAt: string;
} {
  const field = 'crash_rate(session)';
  const groups = payload.groups ?? [];
  if (groups.length !== 1) {
    throw new Error('Sentry returned a non-aggregate session error-rate response');
  }

  const group = groups[0];
  const total = group.totals?.[field];
  const value =
    typeof total === 'number' && Number.isFinite(total)
      ? total
      : [...(group.series?.[field] ?? [])]
          .reverse()
          .find(item => typeof item === 'number' && Number.isFinite(item));
  const observedAt = payload.intervals?.at(-1) ?? payload.end;
  if (typeof value !== 'number' || !observedAt) {
    throw new Error('Sentry returned no complete session error-rate value');
  }

  const date = new Date(observedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid Sentry metric timestamp');
  return { value: value * 100, observedAt: date.toISOString() };
}

async function fetchMetric(
  key: MetricKey,
  deps: SentryDashboardMetricsDeps
): Promise<{ value: number; observedAt: string }> {
  if (!deps.organization || !deps.apiToken) {
    throw new HttpError(500, 'Sentry metrics are not configured');
  }

  const response = await deps.fetch(buildSentryMetricUrl(deps.organization, key), {
    headers: { Authorization: `Bearer ${deps.apiToken}` },
  });

  if (!response.ok) throw new Error(`Sentry returned ${response.status}`);
  const payload = await response.json();
  return key === 'errorRate'
    ? parseSessionsMetricResponse(payload as SentrySessionsResponse)
    : parseTimeseriesMetricResponse(payload as SentryTimeSeriesResponse);
}

async function readMetric(
  key: MetricKey,
  deps: SentryDashboardMetricsDeps
): Promise<SentryMetricResult> {
  const config = METRIC_CONFIG[key];
  const now = deps.now();
  const cached = deps.cache.get(key);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      value: cached.value,
      unit: config.unit,
      status: 'fresh',
      observedAt: cached.observedAt,
    };
  }

  try {
    const metric = await fetchMetric(key, deps);
    deps.cache.set(key, { ...metric, fetchedAt: now });
    return { ...metric, unit: config.unit, status: 'fresh' };
  } catch (error) {
    if (error instanceof HttpError) throw error;

    if (cached) {
      return {
        value: cached.value,
        unit: config.unit,
        status: 'stale',
        observedAt: cached.observedAt,
        error: 'Sentry metric unavailable',
      };
    }

    return {
      value: null,
      unit: config.unit,
      status: 'unavailable',
      observedAt: null,
      error: 'Sentry metric unavailable',
    };
  }
}

async function assertSiteAdmin(
  supabase: HandlerCtx<Record<string, never>>['supabase'],
  authUserId: string
): Promise<void> {
  const { data: callerPerson, error: callerError } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId)
    .is('deleted_at', null)
    .single();

  if (callerError || !callerPerson) throw new HttpError(403, 'Caller not found');

  const { data: roles, error: rolesError } = await applyActiveRoleValidity(
    supabase.from('user_roles').select('role:roles(name)').eq('user_id', callerPerson.id)
  );

  if (rolesError) throw new HttpError(500, 'Failed to verify caller role');

  const isSiteAdmin = rolesInclude(roles, 'site_admin');
  if (!isSiteAdmin) throw new HttpError(403, 'Unauthorized: requires site_admin role');
}

export async function createSentryDashboardMetricsHandler(
  { user, supabase }: HandlerCtx<Record<string, never>>,
  deps: SentryDashboardMetricsDeps
): Promise<SentryDashboardMetricsResponse> {
  if (!user) throw new HttpError(401, 'Authentication failed');
  await assertSiteAdmin(supabase, user.id);

  const [errorRate, apiP95] = await Promise.all([
    readMetric('errorRate', deps),
    readMetric('apiP95', deps),
  ]);

  return {
    generatedAt: new Date(deps.now()).toISOString(),
    window: SENTRY_QUERY_WINDOW,
    errorRate,
    apiP95,
  };
}
