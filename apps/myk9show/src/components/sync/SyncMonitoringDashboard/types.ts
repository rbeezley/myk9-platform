import React from 'react';

export type TimeRange = '1h' | '24h' | '7d' | '30d';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
  status?: 'success' | 'warning' | 'error' | 'neutral';
  onClick?: () => void;
}

export interface HealthGaugeProps {
  score: number;
  label: string;
}

export interface TimeSeriesChartProps {
  data: Array<{ time: Date; value: number }>;
  label: string;
  color?: string;
}
