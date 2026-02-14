import {
  Timer,
  HardDrive,
  Cpu,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import type { MetricCard, PerformanceData } from './types';

export const getVitalStatus = (name: string, value: number): 'good' | 'needs-improvement' | 'poor' => {
  const thresholds = {
    LCP: { good: 2500, poor: 4000 },
    FCP: { good: 1800, poor: 3000 },
    CLS: { good: 0.1, poor: 0.25 },
    FID: { good: 100, poor: 300 },
    TTFB: { good: 600, poor: 1500 },
    INP: { good: 200, poor: 500 },
  };

  const threshold = thresholds[name as keyof typeof thresholds];
  if (!threshold) return 'good';

  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
};

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'good': return 'text-green-600 bg-green-100';
    case 'needs-improvement': return 'text-yellow-600 bg-yellow-100';
    case 'poor': return 'text-red-600 bg-red-100';
    default: return 'text-gray-600 bg-gray-100';
  }
};

export const getCoreWebVitalsCards = (performanceData: PerformanceData | null): MetricCard[] => {
  if (!performanceData?.summary?.vitals) return [];

  return Object.entries(performanceData.summary.vitals).map(([name, value]) => {
    const numValue = value as number;
    const status = getVitalStatus(name, numValue);
    const unit = name === 'CLS' ? '' : 'ms';

    return {
      name: name === 'LCP' ? 'Largest Contentful Paint' :
            name === 'FCP' ? 'First Contentful Paint' :
            name === 'CLS' ? 'Cumulative Layout Shift' :
            name === 'FID' ? 'First Input Delay' :
            name === 'TTFB' ? 'Time to First Byte' : name,
      value: numValue.toFixed(name === 'CLS' ? 3 : 0),
      unit,
      status,
      icon: Timer,
    };
  });
};

export const getCustomMetricsCards = (performanceData: PerformanceData | null): MetricCard[] => {
  if (!performanceData?.summary?.customMetrics) return [];

  return [
    {
      name: 'Memory Usage',
      value: (performanceData.runtimeMetrics.memory_usage || 0).toFixed(1),
      unit: 'MB',
      status: performanceData.runtimeMetrics.memory_usage > 100 ? 'needs-improvement' : 'good',
      icon: HardDrive,
    },
    {
      name: 'DOM Nodes',
      value: (performanceData.runtimeMetrics.dom_nodes || 0).toString(),
      unit: 'nodes',
      status: performanceData.runtimeMetrics.dom_nodes > 1500 ? 'needs-improvement' : 'good',
      icon: Cpu,
    },
    {
      name: 'Session Duration',
      value: Math.round(performanceData.summary.sessionDuration / 1000 / 60).toString(),
      unit: 'min',
      status: 'good',
      icon: Clock,
    },
    {
      name: 'Error Count',
      value: performanceData.summary.errorCount.toString(),
      unit: 'errors',
      status: performanceData.summary.errorCount > 0 ? 'poor' : 'good',
      icon: AlertTriangle,
    },
  ];
};
