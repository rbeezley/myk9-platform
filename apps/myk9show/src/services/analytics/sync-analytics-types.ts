/**
 * Sync Analytics Type Aliases
 *
 * Convenience type aliases for commonly used analytics types.
 * The canonical type definitions live in `../../types/analytics-types.ts`.
 */

import type { SyncMetrics } from '../../types/analytics-types';

/** Alias for the full SyncMetrics interface */
export type DetailedSyncMetrics = SyncMetrics;

/** Numeric health score in the range 0-100 */
export type SyncHealthScore = number;

/** Time-series data point array used for trend charts */
export type SyncTrend = Array<{ timestamp: Date; value: number }>;

/**
 * Input factors for the health score calculation
 */
export interface HealthScoreFactors {
  successRate: number;
  averageSyncTime: number;
  conflictRate: number;
  totalSyncs: number;
}
