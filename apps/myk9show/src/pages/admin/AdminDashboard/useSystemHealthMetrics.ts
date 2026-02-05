/**
 * useSystemHealthMetrics Hook
 *
 * Manages system health monitoring with periodic updates.
 */

import { useEffect, useState } from 'react';
import { logger } from '@/services/LoggingService';
import {
  systemHealthService,
  SystemHealthMetrics,
} from '@/services/SystemHealthService';
import type { SystemHealthData } from './admin-dashboard-types';

const HEALTH_UPDATE_INTERVAL_MS = 30000; // 30 seconds

export function useSystemHealthMetrics(): SystemHealthData {
  const [healthMetrics, setHealthMetrics] = useState<SystemHealthMetrics | null>(null);

  useEffect(() => {
    // Get initial health metrics
    const updateHealthMetrics = () => {
      try {
        const metrics = systemHealthService.getSystemHealth();
        setHealthMetrics(metrics);
      } catch (error) {
        logger.warn('Failed to get system health metrics:', 'admin', {}, error as Error);
        setHealthMetrics(null);
      }
    };

    // Update immediately
    updateHealthMetrics();

    // Set up periodic updates
    const interval = setInterval(updateHealthMetrics, HEALTH_UPDATE_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      clearInterval(interval);
    };
  }, []);

  // Calculate system uptime from health metrics or fallback
  const systemUptime = healthMetrics
    ? `${Math.min(
        healthMetrics.database.uptime,
        healthMetrics.api.uptime,
        healthMetrics.authentication.uptime,
        healthMetrics.storage.uptime
      ).toFixed(1)}%`
    : '99.9%';

  return {
    healthMetrics,
    systemUptime,
  };
}
