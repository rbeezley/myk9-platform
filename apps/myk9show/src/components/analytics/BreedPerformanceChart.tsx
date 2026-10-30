import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BreedPerformance } from './analytics-filters';

interface BreedPerformanceChartProps {
  data: BreedPerformance[];
}

function BreedTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: BreedPerformance & { ratePct: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]!.payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
      <div className="font-medium">{row.breed}</div>
      <div className="text-muted-foreground">
        {row.qualified} of {row.scored} qualified ({row.ratePct}%)
      </div>
    </div>
  );
}

export function BreedPerformanceChart({ data }: BreedPerformanceChartProps) {
  const chartData = useMemo(
    () => data.map(row => ({ ...row, ratePct: Math.round(row.qualificationRate * 100) })),
    [data]
  );

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Breed Performance</CardTitle>
        <p className="text-sm text-muted-foreground">
          Qualification rate for the most-entered breeds
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 36 + 40)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
              className="text-xs"
            />
            <YAxis type="category" dataKey="breed" width={120} className="text-xs" />
            <Tooltip content={<BreedTooltip />} cursor={{ fill: 'transparent' }} />
            <Bar dataKey="ratePct" fill="#10b981" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
