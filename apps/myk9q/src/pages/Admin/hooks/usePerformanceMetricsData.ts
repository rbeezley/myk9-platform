/**
 * React Query hooks for PerformanceMetricsAdmin page
 *
 * Replaces manual data fetching with React Query for automatic caching and background refetching.
 * Benefits:
 * - Automatic caching with configurable stale/cache times
 * - Deduplication (multiple components requesting same data = 1 network call)
 * - Background refetching
 * - Built-in loading/error states
 * - Query invalidation helpers
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { metricsApiService, SessionSummaryRecord } from '../../../services/metricsApiService';
import { logger } from '../../../utils/logger';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface VenueStats {
  total_sessions: number;
  high_error_sessions: number;
  offline_heavy_sessions: number;
  sync_conflict_sessions: number;
  avg_duration_ms: number;
}

// ============================================================
// QUERY KEYS (centralized for easy invalidation)
// ============================================================

export const performanceMetricsKeys = {
  all: (licenseKey: string) => ['performanceMetrics', licenseKey] as const,
  sessions: (licenseKey: string, days: number) =>
    ['performanceMetrics', licenseKey, 'sessions', days] as const,
  stats: (licenseKey: string, days: number) =>
    ['performanceMetrics', licenseKey, 'stats', days] as const,
};

// ============================================================
// FETCH FUNCTIONS
// ============================================================

/**
 * Fetch session metrics for a show
 */
async function fetchSessions(
  licenseKey: string | undefined,
  days: number
): Promise<SessionSummaryRecord[]> {
  if (!licenseKey) {
    logger.log('⏸️ Skipping sessions fetch - licenseKey not ready yet');
    return [];
  }

  logger.log('🔍 Fetching session metrics for license key:', licenseKey, 'days:', days);

  const data = await metricsApiService.getShowMetrics(licenseKey, days);

  logger.log('✅ Session metrics loaded:', data.length, 'sessions');

  return data;
}

/**
 * Fetch venue stats for a show
 */
async function fetchStats(
  licenseKey: string | undefined,
  days: number
): Promise<VenueStats | null> {
  if (!licenseKey) {
    logger.log('⏸️ Skipping stats fetch - licenseKey not ready yet');
    return null;
  }

  logger.log('🔍 Fetching venue stats for license key:', licenseKey, 'days:', days);

  const data = await metricsApiService.getVenueStats(licenseKey, days);

  logger.log('✅ Venue stats loaded');

  // Service returns {} on error, convert to null for consistency
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return null;
  }

  return data as VenueStats;
}

// ============================================================
// CUSTOM HOOKS
// ============================================================

/**
 * Hook to fetch session metrics
 */
export function useSessions(licenseKey: string | undefined, days: number) {
  return useQuery({
    queryKey: performanceMetricsKeys.sessions(licenseKey || '', days),
    queryFn: () => fetchSessions(licenseKey, days),
    enabled: !!licenseKey, // Only run if licenseKey is provided
    staleTime: 2 * 60 * 1000, // 2 minutes (metrics change occasionally)
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

/**
 * Hook to fetch venue stats
 */
export function useStats(licenseKey: string | undefined, days: number) {
  return useQuery({
    queryKey: performanceMetricsKeys.stats(licenseKey || '', days),
    queryFn: () => fetchStats(licenseKey, days),
    enabled: !!licenseKey, // Only run if licenseKey is provided
    staleTime: 2 * 60 * 1000, // 2 minutes (stats change occasionally)
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

/**
 * Helper hook that combines all performance metrics data fetching
 */
export function usePerformanceMetricsData(
  licenseKey: string | undefined,
  days: number
) {
  const sessionsQuery = useSessions(licenseKey, days);
  const statsQuery = useStats(licenseKey, days);

  // Track online/offline status for graceful degradation
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    sessions: sessionsQuery.data || [],
    stats: statsQuery.data || null,
    isLoading: sessionsQuery.isLoading || statsQuery.isLoading,
    isRefreshing: sessionsQuery.isFetching || statsQuery.isFetching,
    isOffline,
    error: sessionsQuery.error || statsQuery.error,
    refetch: () => {
      sessionsQuery.refetch();
      statsQuery.refetch();
    },
  };
}
