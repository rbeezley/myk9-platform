import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { TrendPoint } from './analytics-utils';

interface QualificationTrendChartProps {
  data: TrendPoint[];
}

interface TrendTooltipPayloadItem {
  payload: TrendPoint;
}

function formatDateTick(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatYAxisTick(value: number): string {
  return `${value}%`;
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TrendTooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]!.payload;
  const pct = Math.round(point.qualificationRate * 100);
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
      <div className="font-medium">{point.showName}</div>
      <div className="text-muted-foreground">
        {point.qualifiedCount} of {point.totalEntries} qualified ({pct}%)
      </div>
    </div>
  );
}

function toChartData(data: TrendPoint[]) {
  return data.map(point => ({
    ...point,
    qualificationRatePct: Math.round(point.qualificationRate * 100),
  }));
}

export function QualificationTrendChart({ data }: QualificationTrendChartProps) {
  const chartData = useMemo(() => toChartData(data), [data]);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Qualification Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="qualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis dataKey="showDate" tickFormatter={formatDateTick} className="text-xs" />
            <YAxis domain={[0, 100]} tickFormatter={formatYAxisTick} className="text-xs" />
            <Tooltip content={<TrendTooltip />} />
            <Area
              type="monotone"
              dataKey="qualificationRatePct"
              stroke="#10b981"
              fill="url(#qualGradient)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
