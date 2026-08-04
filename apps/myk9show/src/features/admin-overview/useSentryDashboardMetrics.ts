import { useQuery } from '@tanstack/react-query';
import { fetchSentryDashboardMetrics, type SentryDashboardMetrics } from './sentryDashboardMetrics';

export function useSentryDashboardMetrics() {
  return useQuery<SentryDashboardMetrics>({
    queryKey: ['admin', 'sentry-dashboard-metrics'],
    queryFn: fetchSentryDashboardMetrics,
    staleTime: 55_000,
    refetchInterval: 60_000,
  });
}
