import React from 'react';

export interface MetricCard {
  name: string;
  value: string;
  unit: string;
  status: 'good' | 'needs-improvement' | 'poor';
  trend?: 'up' | 'down' | 'stable';
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export interface PerformanceData {
  summary: {
    vitals: Record<string, number>;
    customMetrics?: Record<string, number>;
    sessionDuration: number;
    errorCount: number;
  };
  runtimeMetrics: {
    memory_usage: number;
    dom_nodes: number;
  };
  budgetStatus?: {
    activeRules: number;
    recentViolations: number;
  };
  session?: {
    device: {
      type: string;
      browser: string;
      version: string;
      os: string;
      screenResolution: string;
      pixelRatio: number;
    };
    connection?: {
      effectiveType: string;
      downlink: number;
      rtt: number;
      saveData: boolean;
    };
  };
}
