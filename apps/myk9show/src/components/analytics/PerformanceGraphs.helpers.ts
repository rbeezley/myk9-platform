/**
 * Helper functions for the PerformanceGraphs component
 */

import type { SyncMetrics } from '@/types/analytics-types';
import {
  PERFORMANCE_THRESHOLDS,
  type PerformancePercentiles,
  type RegressionData,
  type PerformanceStatus,
} from './PerformanceGraphs.types';

/**
 * Calculate performance percentiles from sync metrics
 */
export function calculatePerformancePercentiles(
  metrics: SyncMetrics | null
): PerformancePercentiles | null {
  if (!metrics?.recentEvents) return null;

  const syncTimes = metrics.recentEvents
    .filter(e => e.duration && e.status === 'completed')
    .map(e => e.duration! / 1000)
    .sort((a, b) => a - b);

  if (syncTimes.length === 0) return null;

  const getPercentile = (arr: number[], percentile: number) => {
    const index = Math.floor((percentile / 100) * arr.length);
    return arr[Math.min(index, arr.length - 1)];
  };

  return {
    p50: getPercentile(syncTimes, 50),
    p90: getPercentile(syncTimes, 90),
    p95: getPercentile(syncTimes, 95),
    p99: getPercentile(syncTimes, 99),
  };
}

/**
 * Generate regression analysis data from sync time trend
 */
export function generateRegressionData(metrics: SyncMetrics | null): RegressionData | null {
  if (!metrics?.syncTimeTrend) return null;

  const data = metrics.syncTimeTrend.map((point, index) => ({
    x: index,
    y: point.value,
    timestamp: point.timestamp,
  }));

  // Simple linear regression
  const n = data.length;
  const sumX = data.reduce((sum, d) => sum + d.x, 0);
  const sumY = data.reduce((sum, d) => sum + d.y, 0);
  const sumXY = data.reduce((sum, d) => sum + d.x * d.y, 0);
  const sumX2 = data.reduce((sum, d) => sum + d.x * d.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const trendLine = data.map(d => ({
    x: d.x,
    trend: slope * d.x + intercept,
    timestamp: d.timestamp,
  }));

  return {
    data,
    trendLine,
    slope,
    isImproving: slope < 0,
  };
}

/**
 * Get performance status indicator based on metric value
 */
export function getPerformanceStatus(
  value: number,
  metric: 'syncTime' | 'successRate' | 'conflictRate'
): PerformanceStatus {
  const thresholds = PERFORMANCE_THRESHOLDS;

  if (metric === 'syncTime') {
    if (value <= thresholds.excellent.syncTime)
      return { status: 'excellent', color: 'text-green-600' };
    if (value <= thresholds.good.syncTime) return { status: 'good', color: 'text-blue-600' };
    if (value <= thresholds.fair.syncTime) return { status: 'fair', color: 'text-yellow-600' };
    return { status: 'poor', color: 'text-red-600' };
  }

  if (metric === 'successRate') {
    if (value >= thresholds.excellent.successRate)
      return { status: 'excellent', color: 'text-green-600' };
    if (value >= thresholds.good.successRate) return { status: 'good', color: 'text-blue-600' };
    if (value >= thresholds.fair.successRate) return { status: 'fair', color: 'text-yellow-600' };
    return { status: 'poor', color: 'text-red-600' };
  }

  // conflictRate
  if (value <= thresholds.excellent.conflictRate)
    return { status: 'excellent', color: 'text-green-600' };
  if (value <= thresholds.good.conflictRate) return { status: 'good', color: 'text-blue-600' };
  if (value <= thresholds.fair.conflictRate) return { status: 'fair', color: 'text-yellow-600' };
  return { status: 'poor', color: 'text-red-600' };
}
