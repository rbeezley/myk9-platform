import { supabase } from '@/services/database/supabaseClient';

export type SentryMetricStatus = 'fresh' | 'stale' | 'unavailable';

export interface SentryMetricResult {
  value: number | null;
  unit: 'percent' | 'milliseconds';
  status: SentryMetricStatus;
  observedAt: string | null;
  error?: string;
}

export interface SentryDashboardMetrics {
  generatedAt: string;
  window: '24h';
  errorRate: SentryMetricResult;
  apiP95: SentryMetricResult;
}

export interface SentryMetricTileState {
  value: string;
  context: string;
  isError: boolean;
  isStale: boolean;
}

const DEFAULT_TRACES_SAMPLE_RATE = 0.05;

function getTracesSampleRate(): number {
  const configured = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE);
  return Number.isFinite(configured)
    ? Math.min(1, Math.max(0, configured))
    : DEFAULT_TRACES_SAMPLE_RATE;
}

function parseMetricResult(raw: unknown, metricName: string): SentryMetricResult {
  if (!raw || typeof raw !== 'object') throw new Error(`Invalid Sentry ${metricName} metric`);

  const candidate = raw as Partial<SentryMetricResult>;
  const validUnit = candidate.unit === 'percent' || candidate.unit === 'milliseconds';
  const validStatus =
    candidate.status === 'fresh' ||
    candidate.status === 'stale' ||
    candidate.status === 'unavailable';
  const validValue = candidate.value === null || typeof candidate.value === 'number';

  if (!validUnit || !validStatus || !validValue) {
    throw new Error(`Invalid Sentry ${metricName} metric`);
  }

  return {
    value: candidate.value,
    unit: candidate.unit,
    status: candidate.status,
    observedAt: typeof candidate.observedAt === 'string' ? candidate.observedAt : null,
    ...(typeof candidate.error === 'string' ? { error: candidate.error } : {}),
  } as SentryMetricResult;
}

export function parseSentryDashboardMetrics(raw: unknown): SentryDashboardMetrics {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Sentry metrics response');

  const candidate = raw as Partial<SentryDashboardMetrics>;
  if (candidate.window !== '24h' || typeof candidate.generatedAt !== 'string') {
    throw new Error('Invalid Sentry metrics response');
  }

  return {
    generatedAt: candidate.generatedAt,
    window: '24h',
    errorRate: parseMetricResult(candidate.errorRate, 'error rate'),
    apiP95: parseMetricResult(candidate.apiP95, 'API p95'),
  };
}

export function formatSentryMetricValue(metric: SentryMetricResult): string {
  if (metric.value === null || metric.status === 'unavailable') return '—';
  if (metric.unit === 'percent') return `${metric.value}%`;
  return `${Math.round(metric.value)} ms`;
}

export function getSentryMetricTileState(
  metric: SentryMetricResult | undefined,
  label: string,
  isLoading: boolean,
  queryError: unknown
): SentryMetricTileState {
  if (isLoading) {
    return { value: '—', context: 'checking platform metrics', isError: false, isStale: false };
  }

  if (queryError || !metric || metric.status === 'unavailable') {
    return {
      value: '—',
      context: `couldn't read ${label.toLowerCase()}`,
      isError: true,
      isStale: false,
    };
  }

  if (metric.status === 'stale') {
    return {
      value: formatSentryMetricValue(metric),
      context: 'using an older reading',
      isError: false,
      isStale: true,
    };
  }

  return {
    value: formatSentryMetricValue(metric),
    context:
      metric.unit === 'milliseconds'
        ? getTracesSampleRate() < 0.1
          ? `time users experienced · low sampling (${Math.round(getTracesSampleRate() * 100)}%)`
          : 'time users experienced · sampled visits'
        : 'last 24 hours',
    isError: false,
    isStale: false,
  };
}

async function fetchSentryDashboardMetrics(): Promise<SentryDashboardMetrics> {
  const { data, error } = await supabase.functions.invoke('sentry-dashboard-metrics', {
    body: {},
  });
  if (error) throw error;
  return parseSentryDashboardMetrics(data);
}

export { fetchSentryDashboardMetrics };
