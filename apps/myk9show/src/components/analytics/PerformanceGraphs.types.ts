/**
 * Types and constants for the PerformanceGraphs component
 */

export interface PerformanceGraphsProps {
  className?: string;
}

export interface TimeRange {
  value: string;
  label: string;
  hours: number;
}

/** Time range options for performance graphs */
export const TIME_RANGES: TimeRange[] = [
  { value: '1h', label: '1 Hour', hours: 1 },
  { value: '6h', label: '6 Hours', hours: 6 },
  { value: '24h', label: '24 Hours', hours: 24 },
  { value: '7d', label: '7 Days', hours: 168 },
  { value: '30d', label: '30 Days', hours: 720 },
];

/** Performance thresholds for status indicators */
export const PERFORMANCE_THRESHOLDS = {
  excellent: { syncTime: 1, successRate: 98, conflictRate: 1 },
  good: { syncTime: 3, successRate: 95, conflictRate: 3 },
  fair: { syncTime: 5, successRate: 90, conflictRate: 5 },
  poor: { syncTime: 10, successRate: 80, conflictRate: 10 },
};

export interface PerformancePercentiles {
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface RegressionData {
  data: Array<{ x: number; y: number; timestamp: Date }>;
  trendLine: Array<{ x: number; trend: number; timestamp: Date }>;
  slope: number;
  isImproving: boolean;
}

export interface PerformanceStatus {
  status: string;
  color: string;
}
