/**
 * React Query hooks for AuditLog page
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
import {
  fetchAuditLog,
  getUniqueAdministrators,
  type AuditLogEntry,
  type AuditLogFilters,
} from '../../../services/auditLogService';
import { logger } from '../../../utils/logger';

// ============================================================
// QUERY KEYS (centralized for easy invalidation)
// ============================================================

export const auditLogKeys = {
  all: (licenseKey: string) => ['auditLog', licenseKey] as const,
  entries: (licenseKey: string, filters: AuditLogFilters, limit: number) =>
    ['auditLog', licenseKey, 'entries', filters, limit] as const,
  administrators: (licenseKey: string) =>
    ['auditLog', licenseKey, 'administrators'] as const,
};

// ============================================================
// FETCH FUNCTIONS
// ============================================================

/**
 * Fetch audit log entries with filters and limit
 */
async function fetchAuditLogEntries(
  licenseKey: string | undefined,
  filters: AuditLogFilters,
  limit: number
): Promise<AuditLogEntry[]> {
  if (!licenseKey) {
    logger.log('⏸️ Skipping audit log fetch - licenseKey not ready yet');
    return [];
  }

  logger.log('🔍 Fetching audit log entries:', { licenseKey, filters, limit });

  const data = await fetchAuditLog(licenseKey, filters, limit);

  logger.log('✅ Audit log entries loaded:', data.length, 'entries');

  return data;
}

/**
 * Fetch unique administrators for filter dropdown
 */
async function fetchAdministrators(
  licenseKey: string | undefined
): Promise<string[]> {
  if (!licenseKey) {
    logger.log('⏸️ Skipping administrators fetch - licenseKey not ready yet');
    return [];
  }

  logger.log('🔍 Fetching unique administrators for license key:', licenseKey);

  const admins = await getUniqueAdministrators(licenseKey);

  logger.log('✅ Administrators loaded:', admins.length, 'unique admins');

  return admins;
}

// ============================================================
// CUSTOM HOOKS
// ============================================================

/**
 * Hook to fetch audit log entries with filters
 */
export function useAuditLogEntries(
  licenseKey: string | undefined,
  filters: AuditLogFilters,
  limit: number
) {
  return useQuery({
    queryKey: auditLogKeys.entries(licenseKey || '', filters, limit),
    queryFn: () => fetchAuditLogEntries(licenseKey, filters, limit),
    enabled: !!licenseKey, // Only run if licenseKey is provided
    staleTime: 1 * 60 * 1000, // 1 minute (audit log changes occasionally)
    gcTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

/**
 * Hook to fetch unique administrators
 */
export function useAdministrators(licenseKey: string | undefined) {
  return useQuery({
    queryKey: auditLogKeys.administrators(licenseKey || ''),
    queryFn: () => fetchAdministrators(licenseKey),
    enabled: !!licenseKey, // Only run if licenseKey is provided
    staleTime: 5 * 60 * 1000, // 5 minutes (administrators rarely change)
    gcTime: 10 * 60 * 1000, // 10 minutes cache
  });
}

/**
 * Helper hook that combines all audit log data fetching
 */
export function useAuditLogData(
  licenseKey: string | undefined,
  filters: AuditLogFilters,
  limit: number
) {
  const entriesQuery = useAuditLogEntries(licenseKey, filters, limit);
  const administratorsQuery = useAdministrators(licenseKey);

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
    entries: entriesQuery.data || [],
    administrators: administratorsQuery.data || [],
    isLoading: entriesQuery.isLoading || administratorsQuery.isLoading,
    isRefreshing: entriesQuery.isFetching || administratorsQuery.isFetching,
    isOffline,
    error: entriesQuery.error || administratorsQuery.error,
    refetch: () => {
      entriesQuery.refetch();
      administratorsQuery.refetch();
    },
  };
}
