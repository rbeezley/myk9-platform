/**
 * Chart sub-components for PerformanceGraphs
 */

import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  AreaChart as RechartsAreaChart,
  Area as RechartsArea,
  BarChart as RechartsBarChart,
  Bar as RechartsBar,
  ScatterChart as RechartsScatterChart,
  Scatter as RechartsScatter,
  ComposedChart as RechartsComposedChart,
  XAxis as RechartsXAxis,
  YAxis as RechartsYAxis,
  CartesianGrid as RechartsCartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ResponsiveContainer as RechartsResponsiveContainer,
  ReferenceLine as RechartsReferenceLine,
  PieChart as RechartsPieChart,
  Pie as RechartsPie,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SyncMetrics } from '@/types/analytics-types';
import {
  PERFORMANCE_THRESHOLDS,
  type PerformancePercentiles,
  type RegressionData,
} from './PerformanceGraphs.types';

// Cast Recharts components to solve 'not a valid JSX component' type errors
const LineChart = RechartsLineChart as React.ComponentType<
  React.ComponentProps<typeof RechartsLineChart>
>;
const Line = RechartsLine as React.ComponentType<React.ComponentProps<typeof RechartsLine>>;
const AreaChart = RechartsAreaChart as React.ComponentType<
  React.ComponentProps<typeof RechartsAreaChart>
>;
const Area = RechartsArea as React.ComponentType<React.ComponentProps<typeof RechartsArea>>;
const BarChart = RechartsBarChart as React.ComponentType<
  React.ComponentProps<typeof RechartsBarChart>
>;
const Bar = RechartsBar as React.ComponentType<React.ComponentProps<typeof RechartsBar>>;
const ScatterChart = RechartsScatterChart as React.ComponentType<
  React.ComponentProps<typeof RechartsScatterChart>
>;
const Scatter = RechartsScatter as React.ComponentType<
  React.ComponentProps<typeof RechartsScatter>
>;
const ComposedChart = RechartsComposedChart as React.ComponentType<
  React.ComponentProps<typeof RechartsComposedChart>
>;
const XAxis = RechartsXAxis as React.ComponentType<React.ComponentProps<typeof RechartsXAxis>>;
const YAxis = RechartsYAxis as React.ComponentType<React.ComponentProps<typeof RechartsYAxis>>;
const CartesianGrid = RechartsCartesianGrid as React.ComponentType<
  React.ComponentProps<typeof RechartsCartesianGrid>
>;
const Tooltip = RechartsTooltip as React.ComponentType<
  React.ComponentProps<typeof RechartsTooltip>
>;
const Legend = RechartsLegend as React.ComponentType<React.ComponentProps<typeof RechartsLegend>>;
const ResponsiveContainer = RechartsResponsiveContainer as React.ComponentType<
  React.ComponentProps<typeof RechartsResponsiveContainer>
>;
const ReferenceLine = RechartsReferenceLine as React.ComponentType<
  React.ComponentProps<typeof RechartsReferenceLine>
>;
const PieChart = RechartsPieChart as React.ComponentType<
  React.ComponentProps<typeof RechartsPieChart>
>;
const Pie = RechartsPie as React.ComponentType<React.ComponentProps<typeof RechartsPie>>;

// Lucide icons used across charts
import {
  Activity as LucideActivity,
  TrendingUp as LucideTrendingUp,
  TrendingDown as LucideTrendingDown,
  Wifi as LucideWifi,
  AlertTriangle as LucideAlertTriangle,
} from 'lucide-react';

const Activity = LucideActivity as React.ComponentType<React.ComponentProps<typeof LucideActivity>>;
const TrendingUp = LucideTrendingUp as React.ComponentType<
  React.ComponentProps<typeof LucideTrendingUp>
>;
const TrendingDown = LucideTrendingDown as React.ComponentType<
  React.ComponentProps<typeof LucideTrendingDown>
>;
const Wifi = LucideWifi as React.ComponentType<React.ComponentProps<typeof LucideWifi>>;
const AlertTriangle = LucideAlertTriangle as React.ComponentType<
  React.ComponentProps<typeof LucideAlertTriangle>
>;

// ---------- Custom Tooltip ----------

export function CustomTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; unit?: string }>;
  label?: string;
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-sm font-medium text-foreground">
        {label ? new Date(label).toLocaleString() : 'N/A'}
      </p>
      {payload.map((entry, index) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {formatter ? formatter(entry.value, entry.name) : entry.value}
          {entry.unit && ` ${entry.unit}`}
        </p>
      ))}
    </div>
  );
}

// ---------- Overview Charts ----------

export function OverviewCharts({ metrics }: { metrics: SyncMetrics }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Sync Performance Over Time */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Sync Performance Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.syncTimeTrend}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value: string | number) => new Date(value).toLocaleTimeString()}
              />
              <YAxis label={{ value: 'Time (s)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                content={<CustomTooltip formatter={(value: number) => `${value.toFixed(2)}s`} />}
              />
              <ReferenceLine
                y={PERFORMANCE_THRESHOLDS.good.syncTime}
                stroke="#f59e0b"
                strokeDasharray="5 5"
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Success Rate Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Success Rate Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={metrics.successRateTrend}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value: string | number) => new Date(value).toLocaleTimeString()}
              />
              <YAxis
                domain={[0, 100]}
                label={{ value: 'Success Rate (%)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                content={<CustomTooltip formatter={(value: number) => `${value.toFixed(1)}%`} />}
              />
              <ReferenceLine
                y={PERFORMANCE_THRESHOLDS.good.successRate}
                stroke="#10b981"
                strokeDasharray="5 5"
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bandwidth Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wifi className="h-5 w-5" />
            Bandwidth Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics.bandwidthTrend}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value: string | number) => new Date(value).toLocaleTimeString()}
              />
              <YAxis label={{ value: 'Bandwidth (MB)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                content={<CustomTooltip formatter={(value: number) => `${value.toFixed(2)} MB`} />}
              />
              <Bar dataKey="value" fill="#8b5cf6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Conflict Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Conflict Rate Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics.conflictRateTrend}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value: string | number) => new Date(value).toLocaleTimeString()}
              />
              <YAxis label={{ value: 'Conflict Rate (%)', angle: -90, position: 'insideLeft' }} />
              <Tooltip
                content={<CustomTooltip formatter={(value: number) => `${value.toFixed(1)}%`} />}
              />
              <ReferenceLine
                y={PERFORMANCE_THRESHOLDS.fair.conflictRate}
                stroke="#f59e0b"
                strokeDasharray="5 5"
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Trends Chart ----------

export function TrendsChart({ metrics }: { metrics: SyncMetrics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Multi-Metric Performance Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ComposedChart
            data={metrics.syncTimeTrend.map((syncPoint, index) => ({
              timestamp: syncPoint.timestamp,
              syncTime: syncPoint.value,
              successRate: metrics.successRateTrend[index]?.value || 0,
              conflictRate: metrics.conflictRateTrend[index]?.value || 0,
              bandwidth: metrics.bandwidthTrend[index]?.value || 0,
            }))}
          >
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis
              dataKey="timestamp"
              tickFormatter={(value: string | number) => new Date(value).toLocaleTimeString()}
            />
            <YAxis yAxisId="left" orientation="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="syncTime"
              stroke="#3b82f6"
              name="Sync Time (s)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="successRate"
              stroke="#10b981"
              name="Success Rate (%)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="conflictRate"
              stroke="#f59e0b"
              name="Conflict Rate (%)"
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="bandwidth"
              fill="#8b5cf6"
              fillOpacity={0.3}
              name="Bandwidth (MB)"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ---------- Percentiles Charts ----------

export function PercentilesCharts({ percentiles }: { percentiles: PerformancePercentiles }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Response Time Percentiles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(percentiles).map(([percentile, value]) => (
              <div key={percentile} className="flex items-center justify-between">
                <span className="text-sm font-medium">{percentile.toUpperCase()}</span>
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-muted rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.min(100, (value / 10) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono">{value.toFixed(2)}s</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Performance Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  {
                    name: 'Excellent (< 1s)',
                    value: percentiles.p50 < 1 ? 50 : 0,
                    fill: '#10b981',
                  },
                  { name: 'Good (1-3s)', value: percentiles.p90 < 3 ? 40 : 30, fill: '#3b82f6' },
                  { name: 'Fair (3-5s)', value: 20, fill: '#f59e0b' },
                  { name: 'Poor (> 5s)', value: percentiles.p95 > 5 ? 20 : 10, fill: '#ef4444' },
                ]}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${name || ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                }
              />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Regression Chart ----------

export function RegressionChart({ regressionData }: { regressionData: RegressionData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {regressionData.isImproving ? (
            <TrendingDown className="h-5 w-5 text-green-600" />
          ) : (
            <TrendingUp className="h-5 w-5 text-red-600" />
          )}
          Performance Regression Analysis
          <Badge variant={regressionData.isImproving ? 'default' : 'destructive'}>
            {regressionData.isImproving ? 'Improving' : 'Degrading'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <ScatterChart data={regressionData.data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="x" name="Time Index" />
            <YAxis dataKey="y" name="Sync Time (s)" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter dataKey="y" fill="#3b82f6" />
            <Line
              type="monotone"
              dataKey="trend"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 5"
              data={regressionData.trendLine}
            />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <p className="text-sm">
            <strong>Trend Analysis:</strong> Performance is{' '}
            <span className={regressionData.isImproving ? 'text-green-600' : 'text-red-600'}>
              {regressionData.isImproving ? 'improving' : 'degrading'}
            </span>{' '}
            at a rate of {Math.abs(regressionData.slope).toFixed(4)} seconds per time unit.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
